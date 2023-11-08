import { BigNumber } from "ethers";
const fs = require('fs');
const axios = require("axios");
const { ethers } = require("ethers");
const { parseBalanceMap } = require('./src/parse-balance-map');

const DelegationRegistryABI = require('./abis/DelegationRegistry.json');
const VotingBalanceV2GaugesABI = require('./abis/VotingBalanceV2Gauges.json');
const IERC20ABI = require('./abis/IERC20.json');

require("dotenv").config();

const dir = __dirname

const AIRDROP_AMOUNT = ethers.utils.parseEther("692");

const VOTE_BLOCK = 17919608;

const REGISTRY_ADDRESS = "0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446"

const VLCVX_ADDRESS = "0x72a19342e8F1838460eBFCCEf09F6585e32db86E"

const PAL_DELEGATION_ADDRESS = "0x68378fCB3A27D5613aFCfddB590d35a6e751972C"

const WARLORD_LOCKER_ADDRESS = "0x700d6d24A55512c6AEC08820B49da4e4193105B3"

const WAR_ADDRESS = "0xa8258deE2a677874a48F5320670A869D74f0cbC1"

const STKWAR_ADDRESS = "0xA86c53AF3aadF20bE5d7a8136ACfdbC4B074758A"

const PROPOSAL_ID = "0xa5e7d2e70e21e41d49454905717d849e4c8dea1e1a8a465553b0576763888472"

const provider = new ethers.providers.JsonRpcProvider(process.env.MAINNET_URI);

const displayBalance = (num: BigNumber, decimals = 4, div = ",") => {
    let temp = Number(ethers.utils.formatEther(num)).toFixed(decimals)
    let values = temp.toString().split(".")
    values[0] = values[0].split("").reverse().map((digit, index) =>
        index != 0 && index % 3 === 0 ? `${digit},` : digit
    ).reverse().join("")
    return values.join(".")
}

(async () => {

    const registry = new ethers.Contract(REGISTRY_ADDRESS, DelegationRegistryABI, provider);
    const vlCVX_votingBalances = new ethers.Contract(VLCVX_ADDRESS, VotingBalanceV2GaugesABI, provider);
    const war = new ethers.Contract(WAR_ADDRESS, IERC20ABI, provider);
    const stkWar = new ethers.Contract(STKWAR_ADDRESS, IERC20ABI, provider);

    console.log("Fetch Snapshot vote result ...")
    const graphqlQueryData = {
        query: `query Votes {
                votes (
                  first: 1000
                  skip: 0
                  where: {
                    proposal: "${PROPOSAL_ID}"
                  }
                  orderBy: "vp",
                  orderDirection: desc
                ) {
                  voter
                  proposal {
                    id
                  }
                  vp
                }
              }`
    }

    const snapshotGraphQLQuery = "https://hub.snapshot.org/graphql"
    const resData = (await axios.post(snapshotGraphQLQuery, graphqlQueryData)).data

    const snasphotVotes = resData.data.votes

    let snapshotVoters: string[] = []

    for (let vote of snasphotVotes) {
        snapshotVoters.push(ethers.utils.getAddress(vote.voter))
    }

    console.log()
    console.log("Fetch all delegtors for the vote, with a non-null balance, not overriding delegation ...")

    let allPotentialDelegators: string[] = []
    let allValidDelegators: string[] = []
    let delegatorBalances = new Map<string, BigNumber>();
    let distributionScores = new Map<string, BigNumber>();

    let warlordScore = BigNumber.from(0)

    let sumVotes = BigNumber.from(0)

    let delegTxs = await registry.queryFilter(registry.filters.SetDelegate(null, null, PAL_DELEGATION_ADDRESS))

    for (let t of delegTxs) {
        const delegatorAddress = t.args['delegator']

        if (allPotentialDelegators.includes(delegatorAddress)) continue;
        allPotentialDelegators.push(delegatorAddress)
    }

    for (let delegator of allPotentialDelegators) {
        let currentDelegate = await registry.delegation(
            delegator,
            "0x6376782e65746800000000000000000000000000000000000000000000000000",
            { blockTag: VOTE_BLOCK }
        )

        const votingBalance = await vlCVX_votingBalances.balanceOf(delegator, { blockTag: VOTE_BLOCK })

        const delegationOverride = snapshotVoters.includes(delegator)

        if (currentDelegate === PAL_DELEGATION_ADDRESS && votingBalance.gt(0) && !delegationOverride) {
            allValidDelegators.push(delegator)
            delegatorBalances.set(delegator, votingBalance)
            sumVotes = sumVotes.add(votingBalance)
        }
    }

    console.log()
    console.log("Calculating distribution for vlCVX delegators ...")

    for (let delegator of allValidDelegators) {
        let score = (delegatorBalances.get(delegator) || BigNumber.from('0')).mul(AIRDROP_AMOUNT).div(sumVotes)
        if (delegator === WARLORD_LOCKER_ADDRESS) {
            warlordScore = score
            console.log('Found Warlord')
        } else {
            distributionScores.set(delegator, score)
        }
    }

    console.log()
    console.log("Splitting Warlord score to WAR & stkWAR holders ...")

    let allWarHolders: string[] = []
    let allStkWarHolders: string[] = []

    let allValidWarAndStkWarHolders: string[] = []

    let warAndStkWarBalancesSum = new Map<string, BigNumber>();

    let totalEligibleSupply = BigNumber.from(0)

    let warTransferTxs = await war.queryFilter(war.filters.Transfer())
    let stkWarTransferTxs = await stkWar.queryFilter(stkWar.filters.Transfer())

    for (let t of warTransferTxs) {
        const from = t.args['from']
        const to = t.args['to']

        if (!allWarHolders.includes(from) && from !== ethers.constants.AddressZero) {
            allWarHolders.push(from)
        }
        if (!allWarHolders.includes(to) && to !== ethers.constants.AddressZero) {
            allWarHolders.push(to)
        }
    }

    for (let t of stkWarTransferTxs) {
        const from = t.args['from']
        const to = t.args['to']

        if (!allStkWarHolders.includes(from) && from !== ethers.constants.AddressZero) {
            allStkWarHolders.push(from)
        }
        if (!allStkWarHolders.includes(to) && to !== ethers.constants.AddressZero) {
            allStkWarHolders.push(to)
        }
    }

    for (let h of allWarHolders) {
        if (h === ethers.constants.AddressZero) continue;
        if (h === STKWAR_ADDRESS) continue;

        const balance = await war.balanceOf(h, { blockTag: VOTE_BLOCK })
        if (balance.gt(0)) {
            if (allValidWarAndStkWarHolders.includes(h)) {
                warAndStkWarBalancesSum.set(h, warAndStkWarBalancesSum.get(h)!.add(balance))
            } else {
                allValidWarAndStkWarHolders.push(h)
                warAndStkWarBalancesSum.set(h, balance)
            }
            totalEligibleSupply = totalEligibleSupply.add(balance)
        }
    }

    for (let h of allStkWarHolders) {
        if (h === ethers.constants.AddressZero) continue;
        if (h === STKWAR_ADDRESS) continue;

        const balance = await stkWar.balanceOf(h, { blockTag: VOTE_BLOCK })
        if (balance.gt(0)) {
            if (allValidWarAndStkWarHolders.includes(h)) {
                warAndStkWarBalancesSum.set(h, warAndStkWarBalancesSum.get(h)!.add(balance))
            } else {
                allValidWarAndStkWarHolders.push(h)
                warAndStkWarBalancesSum.set(h, balance)
            }
            totalEligibleSupply = totalEligibleSupply.add(balance)
        }
    }

    for (let h of allValidWarAndStkWarHolders) {
        let totalBalance = warAndStkWarBalancesSum.get(h)!
        let score = totalBalance.mul(warlordScore).div(totalEligibleSupply)

        if (distributionScores.has(h)) {
            distributionScores.set(h, distributionScores.get(h)!.add(score))
        } else {
            distributionScores.set(h, score)
        }
    }


    // verify the scores => total matches the airdrop amount
    let sumScore = BigNumber.from(0)
    distributionScores.forEach((score, address) => {
        sumScore = sumScore.add(score)
    })
    console.log()
    console.log("Verify total score : ")
    console.log("Airdrop Amount : ", AIRDROP_AMOUNT.toString())
    console.log("Total Score : ", sumScore.toString())

    // generate a merkle tree from the scores
    console.log()
    console.log("Generate the Merkle Tree : ")
    let scores: { [address: string]: number } = {}
    distributionScores.forEach((score, address) => {
        scores[address] = ethers.utils.hexStripZeros(score.toHexString()).slice(2);
    })

    // Verify total scores again
    console.log()
    console.log("Verify total score (2) : ")
    let sumScore2 = BigNumber.from(0)
    for(let address of Object.keys(scores)) {
        sumScore2 = sumScore2.add(BigNumber.from(`0x${scores[address].toString(16)}`))
    }
    console.log("Airdrop Amount : ", AIRDROP_AMOUNT.toString())
    console.log("Total Score : ", sumScore.toString())

    let displayScores: { [address: string]: string } = {}
    distributionScores.forEach((score, address) => {
        displayScores[address] = displayBalance(score)
    })
    console.log(displayScores)

    let merkleTree = parseBalanceMap(scores)

    console.log("Merkle Root : ", merkleTree["merkleRoot"])

    // save scores & merkle to files
    try {
        fs.writeFileSync(dir + '/../proofs/scores.json', JSON.stringify(scores));
    } catch (err) {
        console.error(err);
    }
    try {
        fs.writeFileSync(dir + '/../proofs/proofs.json', JSON.stringify(merkleTree));
    } catch (err) {
        console.error(err);
    }

})();
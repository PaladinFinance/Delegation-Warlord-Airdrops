import { BigNumber } from "ethers";
const fs = require('fs');
const { ethers } = require("ethers");

const IERC20ABI = require('./abis/IERC20.json');

require("dotenv").config();

const dir = __dirname

const SNAP_BLOCK = 19911359;

const WAR_ADDRESS = "0xa8258deE2a677874a48F5320670A869D74f0cbC1"

const STKWAR_ADDRESS = "0xA86c53AF3aadF20bE5d7a8136ACfdbC4B074758A"

const TWAR_ADDRESS = "0x188cA46Aa2c7ae10C14A931512B62991D5901453"

const THWAR_ADDRESS = "0x2fc1E74BC8A6D15fE768c10C2EDe7D6d95ec27e9"

const UNIT = ethers.utils.parseEther("1")

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

    const war = new ethers.Contract(WAR_ADDRESS, IERC20ABI, provider);
    const stkWar = new ethers.Contract(STKWAR_ADDRESS, IERC20ABI, provider);
    const tWar = new ethers.Contract(TWAR_ADDRESS, IERC20ABI, provider);
    const thWar = new ethers.Contract(THWAR_ADDRESS, IERC20ABI, provider);

    
    
    console.log()
    console.log("Fetching all WAR, stkWAR, tWAR & thWAR holders ...")

    // here calculate tWAR <=> WAR ratio at the given block
    const tWarStkWarBalance = await stkWar.balanceOf(TWAR_ADDRESS, { blockTag: SNAP_BLOCK })
    const tWarTotalSupply = await tWar.totalSupply({ blockTag: SNAP_BLOCK })
    const tWarToWarRatio = tWarStkWarBalance.mul(UNIT).div(tWarTotalSupply)
    console.log("tWAR to WAR ratio: ", tWarToWarRatio.toString())

    // here calculate thWAR <=> WAR ratio at the given block
    const thWarStkWarBalance = await stkWar.balanceOf(THWAR_ADDRESS, { blockTag: SNAP_BLOCK })
    const thWarTotalSupply = await thWar.totalSupply({ blockTag: SNAP_BLOCK })
    const thWarToWarRatio = thWarStkWarBalance.mul(UNIT).div(thWarTotalSupply)
    console.log("thWAR to WAR ratio: ", thWarToWarRatio.toString())

    let allWarHolders: string[] = []
    let allStkWarHolders: string[] = []
    let allTWarHolders: string[] = []
    let allThWarHolders: string[] = []

    let allValidHolders: string[] = []

    let userTotalBalances = new Map<string, BigNumber>();
    let userTotalBalancesStrings: { address: string, share: string }[] = []
    let results = {
        total: "",
        balances: userTotalBalancesStrings
    }

    let totalAmount = BigNumber.from(0)

    let warTransferTxs = await war.queryFilter(war.filters.Transfer())
    let stkWarTransferTxs = await stkWar.queryFilter(stkWar.filters.Transfer())
    let tWarTransferTxs = await tWar.queryFilter(tWar.filters.Transfer())
    let thWarTransferTxs = await thWar.queryFilter(thWar.filters.Transfer())

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

    for (let t of tWarTransferTxs) {
        const from = t.args['from']
        const to = t.args['to']

        if (!allTWarHolders.includes(from) && from !== ethers.constants.AddressZero) {
            allTWarHolders.push(from)
        }
        if (!allTWarHolders.includes(to) && to !== ethers.constants.AddressZero) {
            allTWarHolders.push(to)
        }
    }

    for (let t of thWarTransferTxs) {
        const from = t.args['from']
        const to = t.args['to']

        if (!allThWarHolders.includes(from) && from !== ethers.constants.AddressZero) {
            allThWarHolders.push(from)
        }
        if (!allThWarHolders.includes(to) && to !== ethers.constants.AddressZero) {
            allThWarHolders.push(to)
        }
    }

    for (let h of allWarHolders) {
        if (h === ethers.constants.AddressZero) continue;
        if (h === STKWAR_ADDRESS) continue;
        if (h === TWAR_ADDRESS) continue;
        if (h === THWAR_ADDRESS) continue;

        const balance = await war.balanceOf(h, { blockTag: SNAP_BLOCK })
        if (balance.gt(0)) {
            if (allValidHolders.includes(h)) {
                userTotalBalances.set(h, userTotalBalances.get(h)!.add(balance))
            } else {
                allValidHolders.push(h)
                userTotalBalances.set(h, balance)
            }
            totalAmount = totalAmount.add(balance)
        }
    }

    for (let h of allStkWarHolders) {
        if (h === ethers.constants.AddressZero) continue;
        if (h === STKWAR_ADDRESS) continue;
        if (h === TWAR_ADDRESS) continue;
        if (h === THWAR_ADDRESS) continue;

        const balance = await stkWar.balanceOf(h, { blockTag: SNAP_BLOCK })
        if (balance.gt(0)) {
            if (allValidHolders.includes(h)) {
                userTotalBalances.set(h, userTotalBalances.get(h)!.add(balance))
            } else {
                allValidHolders.push(h)
                userTotalBalances.set(h, balance)
            }
            totalAmount = totalAmount.add(balance)
        }
    }

    for (let h of allTWarHolders) {
        if (h === ethers.constants.AddressZero) continue;
        if (h === STKWAR_ADDRESS) continue;
        if (h === TWAR_ADDRESS) continue;
        if (h === THWAR_ADDRESS) continue;

        const balance = await tWar.balanceOf(h, { blockTag: SNAP_BLOCK })
        const underlyingBalance = balance.mul(tWarToWarRatio).div(UNIT)
        if (underlyingBalance.gt(0)) {
            if (allValidHolders.includes(h)) {
                userTotalBalances.set(h, userTotalBalances.get(h)!.add(underlyingBalance))
            } else {
                allValidHolders.push(h)
                userTotalBalances.set(h, underlyingBalance)
            }
            totalAmount = totalAmount.add(underlyingBalance)
        }
    }

    for (let h of allThWarHolders) {
        if (h === ethers.constants.AddressZero) continue;
        if (h === STKWAR_ADDRESS) continue;
        if (h === TWAR_ADDRESS) continue;
        if (h === THWAR_ADDRESS) continue;

        const balance = await thWar.balanceOf(h, { blockTag: SNAP_BLOCK })
        const underlyingBalance = balance.mul(thWarToWarRatio).div(UNIT)
        if (underlyingBalance.gt(0)) {
            if (allValidHolders.includes(h)) {
                userTotalBalances.set(h, userTotalBalances.get(h)!.add(underlyingBalance))
            } else {
                allValidHolders.push(h)
                userTotalBalances.set(h, underlyingBalance)
            }
            totalAmount = totalAmount.add(underlyingBalance)
        }
    }

    // display balances
    for(let h of allValidHolders) {
        results.balances.push(
            {
                address: h,
                share: userTotalBalances.get(h)!.toString()
            }
        )
    }
    results.total = totalAmount.toString()
    console.log(results)
    let jsonArray = JSON.stringify(results)


    // save json to file
    try {
        fs.writeFileSync(dir + '/../out/balances.json', jsonArray);
    } catch (err) {
        console.error(err);
    }

})();
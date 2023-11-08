import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { MerkleDistributor } from "../typechain/contracts/MerkleDistributor";
import { IERC20 } from "../typechain/@openzeppelin/contracts/token/ERC20/IERC20";
import { IERC20__factory } from "../typechain/factories/@openzeppelin/contracts/token/ERC20/IERC20__factory";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ContractFactory } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";
import { getERC20 } from "./utils/utils";
import { parseBalanceMap } from "../scripts/src/parse-balance-map";
import BalanceTree from "../scripts/src/balance-tree";

chai.use(solidity);
const { expect } = chai;
const { provider } = ethers;


let distributorFactory: ContractFactory

let tree: BalanceTree;

let signers: SignerWithAddress[]

const TOKEN_ADDRESS = "0x34635280737b5BFe6c7DC2FC3065D60d66e78185"
const HOLDER_ADDRESS = "0xAAc0aa431c237C2C0B5f041c8e59B3f1a43aC78F"
const AMOUNT = ethers.utils.parseEther('150000')

describe('MerkleDistributor contract tests', () => {
    let deployer: SignerWithAddress
    let admin: SignerWithAddress
    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let user3: SignerWithAddress

    let token: IERC20
    let distributor: MerkleDistributor

    const user1_claim_amount = ethers.utils.parseEther('10')
    const user2_claim_amount = ethers.utils.parseEther('50')
    const user3_claim_amount = ethers.utils.parseEther('15')

    before(async () => {
        [deployer, admin, user1, user2, user3] = await ethers.getSigners();

        signers = (await ethers.getSigners()).slice(1) || []; //all signers exepct the one used as admin
        distributorFactory = await ethers.getContractFactory("MerkleDistributor");

        tree = new BalanceTree([
            { account: user1.address, amount: user1_claim_amount },
            { account: user2.address, amount: user2_claim_amount },
            { account: user3.address, amount: user3_claim_amount },
        ]);

        token = await IERC20__factory.connect(TOKEN_ADDRESS, provider);

        await getERC20(admin, HOLDER_ADDRESS, token, admin.address, AMOUNT);

    })

    beforeEach(async () => {

        const distribution_amount = ethers.utils.parseEther('500');

        distributor = (await distributorFactory.connect(deployer).deploy(
            admin.address,
            token.address,
            tree.getHexRoot()
        )) as MerkleDistributor;
        await distributor.deployed();

        await token.connect(admin).transfer(distributor.address, distribution_amount)

    });

    it(' should be deployed & have correct parameters', async () => {
        expect(distributor.address).to.properAddress

        const distributor_token = await distributor.token()
        const distributor_root = await distributor.merkleRoot()

        expect(distributor_token).to.be.eq(token.address)
        expect(distributor_root).to.be.eq(tree.getHexRoot())

    });

    it(' should fail if constructor parameters are invalid', async () => {

        await expect(
            distributorFactory.connect(deployer).deploy(
                ethers.constants.AddressZero,
                token.address,
                tree.getHexRoot()
            )
        ).to.be.revertedWith('InvalidParameter')

        await expect(
            distributorFactory.connect(deployer).deploy(
                admin.address,
                ethers.constants.AddressZero,
                tree.getHexRoot()
            )
        ).to.be.revertedWith('InvalidParameter')

        await expect(
            distributorFactory.connect(deployer).deploy(
                admin.address,
                token.address,
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            )
        ).to.be.revertedWith('InvalidParameter')

    });


    describe('claim', async () => {

        it(' should claim correctly', async () => {

            let proof = tree.getProof(0, user1.address, user1_claim_amount);

            let old_balance = await token.balanceOf(user1.address)

            await expect(
                distributor.connect(user1).claim(0, user1.address, user1_claim_amount, proof)
            ).to.emit(distributor, "Claimed")
                .withArgs(0, user1.address, user1_claim_amount);

            let new_balance = await token.balanceOf(user1.address)

            expect(new_balance.sub(old_balance)).to.be.eq(user1_claim_amount)

            expect(await distributor.isClaimed(0)).to.be.true

        });

        it(' should not allow double claim', async () => {

            let proof = tree.getProof(0, user1.address, user1_claim_amount);

            await distributor.connect(user1).claim(0, user1.address, user1_claim_amount, proof)

            await expect(
                distributor.connect(user1).claim(0, user1.address, user1_claim_amount, proof)
            ).to.be.revertedWith('AlreadyClaimed')

        });

        it(' should fail if proof is incorrect', async () => {

            let proof = tree.getProof(0, user1.address, user1_claim_amount);

            //empty proof
            await expect(
                distributor.connect(user1).claim(0, user1.address, user1_claim_amount, [])
            ).to.be.revertedWith('InvalidProof')

            //wrong proof
            await expect(
                distributor.connect(user1).claim(0,
                    user1.address,
                    user1_claim_amount,
                    tree.getProof(2, user3.address, user3_claim_amount)
                )
            ).to.be.revertedWith('InvalidProof')

            //incorrect index
            await expect(
                distributor.connect(user1).claim(1, user1.address, user1_claim_amount, proof)
            ).to.be.revertedWith('InvalidProof')

        });

        it(' should fail if amount is incorrect', async () => {

            let proof = tree.getProof(0, user1.address, user1_claim_amount);

            await expect(
                distributor.connect(user1).claim(0, user1.address, user3_claim_amount, proof)
            ).to.be.revertedWith('InvalidProof')

        });

        it(' should fail if claimer address is incorrect', async () => {

            let proof = tree.getProof(0, user1.address, user1_claim_amount);

            await expect(
                distributor.connect(user2).claim(0, user2.address, user1_claim_amount, proof)
            ).to.be.revertedWith('InvalidProof')

        });

        it(' should not allow double claims: 0 then 1', async () => {

            let proof_1 = tree.getProof(0, user1.address, user1_claim_amount);
            let proof_2 = tree.getProof(1, user2.address, user2_claim_amount);

            await distributor.connect(user1).claim(0, user1.address, user1_claim_amount, proof_1)

            await distributor.connect(user2).claim(1, user2.address, user2_claim_amount, proof_2)

            await expect(
                distributor.connect(user1).claim(0, user1.address, user1_claim_amount, proof_1)
            ).to.be.revertedWith('AlreadyClaimed')

        });

        it(' should not allow double claims: 1 then 0', async () => {

            let proof_1 = tree.getProof(0, user1.address, user1_claim_amount);
            let proof_2 = tree.getProof(1, user2.address, user2_claim_amount);

            await distributor.connect(user2).claim(1, user2.address, user2_claim_amount, proof_2)

            await distributor.connect(user1).claim(0, user1.address, user1_claim_amount, proof_1)

            await expect(
                distributor.connect(user2).claim(1, user2.address, user2_claim_amount, proof_2)
            ).to.be.revertedWith('AlreadyClaimed')

        });

        it(' should not allow double claims: 0 then 2', async () => {

            let proof_1 = tree.getProof(0, user1.address, user1_claim_amount);
            let proof_3 = tree.getProof(2, user3.address, user3_claim_amount);

            await distributor.connect(user1).claim(0, user1.address, user1_claim_amount, proof_1)

            await distributor.connect(user3).claim(2, user3.address, user3_claim_amount, proof_3)

            await expect(
                distributor.connect(user1).claim(0, user1.address, user1_claim_amount, proof_1)
            ).to.be.revertedWith('AlreadyClaimed')

        });

        it(' should not allow double claims: 2 then 0', async () => {

            let proof_1 = tree.getProof(0, user1.address, user1_claim_amount);
            let proof_3 = tree.getProof(2, user3.address, user3_claim_amount);

            await distributor.connect(user3).claim(2, user3.address, user3_claim_amount, proof_3)

            await distributor.connect(user1).claim(0, user1.address, user1_claim_amount, proof_1)

            await expect(
                distributor.connect(user3).claim(2, user3.address, user3_claim_amount, proof_3)
            ).to.be.revertedWith('AlreadyClaimed')

        });

    });

    describe('claim - larger tree', async () => {

        let new_distributor: MerkleDistributor
        let new_tree: BalanceTree;

        let total_claim = 0;

        beforeEach(async () => {

            new_tree = new BalanceTree(
                signers.map((s, i) => {
                    total_claim += i + 1

                    return { account: s.address, amount: BigNumber.from(i + 1) };
                })
            );

            new_distributor = (await distributorFactory.connect(deployer).deploy(
                admin.address,
                token.address,
                new_tree.getHexRoot()
            )) as MerkleDistributor;
            await new_distributor.deployed();

            await token.connect(admin).transfer(new_distributor.address, total_claim)

        });

        it(' claim index 0', async () => {

            const index = 0

            const claim_amount = BigNumber.from(index + 1)

            let proof = new_tree.getProof(index, signers[index].address, claim_amount);

            let old_balance = await token.balanceOf(signers[index].address)

            await expect(
                new_distributor.connect(signers[index]).claim(index, signers[index].address, claim_amount, proof)
            ).to.emit(new_distributor, "Claimed")
                .withArgs(index, signers[index].address, claim_amount);

            let new_balance = await token.balanceOf(signers[index].address)

            expect(new_balance.sub(old_balance)).to.be.eq(claim_amount)

            expect(await new_distributor.isClaimed(index)).to.be.true

            await expect(
                new_distributor.connect(signers[index]).claim(index, signers[index].address, claim_amount, proof)
            ).to.be.revertedWith('AlreadyClaimed')

        });

        it(' claim index 5', async () => {

            const index = 5

            const claim_amount = BigNumber.from(index + 1)

            let proof = new_tree.getProof(index, signers[index].address, claim_amount);

            let old_balance = await token.balanceOf(signers[index].address)

            await expect(
                new_distributor.connect(signers[index]).claim(index, signers[index].address, claim_amount, proof)
            ).to.emit(new_distributor, "Claimed")
                .withArgs(index, signers[index].address, claim_amount);

            let new_balance = await token.balanceOf(signers[index].address)

            expect(new_balance.sub(old_balance)).to.be.eq(claim_amount)

            expect(await new_distributor.isClaimed(index)).to.be.true

            await expect(
                new_distributor.connect(signers[index]).claim(index, signers[index].address, claim_amount, proof)
            ).to.be.revertedWith('AlreadyClaimed')

        });

        it(' claim index 15', async () => {

            const index = 15

            const claim_amount = BigNumber.from(index + 1)

            let proof = new_tree.getProof(index, signers[index].address, claim_amount);

            let old_balance = await token.balanceOf(signers[index].address)

            await expect(
                new_distributor.connect(signers[index]).claim(index, signers[index].address, claim_amount, proof)
            ).to.emit(new_distributor, "Claimed")
                .withArgs(index, signers[index].address, claim_amount);

            let new_balance = await token.balanceOf(signers[index].address)

            expect(new_balance.sub(old_balance)).to.be.eq(claim_amount)

            expect(await new_distributor.isClaimed(index)).to.be.true

            await expect(
                new_distributor.connect(signers[index]).claim(index, signers[index].address, claim_amount, proof)
            ).to.be.revertedWith('AlreadyClaimed')

        });

    });


    describe('claim - tree 10 000 users', async () => {

        let new_distributor: MerkleDistributor
        let new_tree: BalanceTree;
        const nb_leaves = 10000;
        const nb_tests = 25;
        const user_claims: { account: string; amount: BigNumber }[] = [];

        const claim_amount = BigNumber.from(50)

        const getRandomIndex = (nb_leaves: number, nb_tests: number) => {
            return Math.floor(Math.random() * (nb_leaves / nb_tests))
        }

        beforeEach(async () => {

            for (let i = 0; i < nb_leaves; i++) {
                const n = { account: user1.address, amount: claim_amount };
                user_claims.push(n);
            }

            new_tree = new BalanceTree(user_claims);

            new_distributor = (await distributorFactory.connect(deployer).deploy(
                admin.address,
                token.address,
                new_tree.getHexRoot()
            )) as MerkleDistributor;
            await new_distributor.deployed();

            await token.connect(admin).transfer(new_distributor.address, claim_amount.mul(nb_leaves))

        });

        it(' check proof verification works', async () => {

            const root = Buffer.from(new_tree.getHexRoot().slice(2), "hex");

            for (let index = 0; index < nb_leaves; index += nb_leaves / nb_tests) {

                let proof = new_tree
                    .getProof(index, user1.address, claim_amount)
                    .map((el: any) => Buffer.from(el.slice(2), "hex"));

                let validProof = BalanceTree.verifyProof(
                    index,
                    user1.address,
                    claim_amount,
                    proof,
                    root
                );

                expect(validProof).to.be.true;
            }

        });

        it(' should not allow double claims', async () => {

            for (let index = 0; index < nb_tests; index += getRandomIndex(nb_leaves, nb_tests)) {
                let proof = new_tree.getProof(index, user1.address, claim_amount);

                let old_balance = await token.balanceOf(user1.address)

                await expect(
                    new_distributor.connect(user1).claim(index, user1.address, claim_amount, proof)
                ).to.emit(new_distributor, "Claimed")
                    .withArgs(index, user1.address, claim_amount);

                let new_balance = await token.balanceOf(user1.address)

                expect(new_balance.sub(old_balance)).to.be.eq(claim_amount)

                await expect(
                    new_distributor.connect(user1).claim(index, user1.address, claim_amount, proof)
                ).to.be.revertedWith('AlreadyClaimed')
            }

        });

    });


    describe('recoverToken', async () => {

        it(' should recover lost ERC20 tokens', async () => {

            const otherERC20_address = "0x6B175474E89094C44Da98b954EedeAC495271d0F"; // DAI
            const otherERC20_holder = "0x075e72a5eDf65F0A5f44699c7654C1a76941Ddc8";
            const erc20 = IERC20__factory.connect(otherERC20_address, provider);

            const lost_amount = ethers.utils.parseEther('100');

            await getERC20(admin, otherERC20_holder, erc20, admin.address, lost_amount);

            await erc20.connect(admin).transfer(distributor.address, lost_amount);

            await distributor.connect(admin).recoverToken(erc20.address, lost_amount)

            const distributor_balance = await erc20.balanceOf(distributor.address);

            expect(distributor_balance).to.be.eq(0)

        });

    });

    describe('parseBalanceMap', async () => {

        let new_distributor: MerkleDistributor
        let claims: {
            [account: string]: {
                index: number;
                amount: string;
                proof: string[];
            };
        };

        const expected_total = 230
        let token_total: number;

        beforeEach(async () => {

            const { merkleRoot, tokenTotal, claims: innerClaims } = parseBalanceMap({
                [user1.address]: 50,
                [user2.address]: 100,
                [user3.address]: 80,
            })

            claims = innerClaims
            token_total = +tokenTotal

            new_distributor = (await distributorFactory.connect(deployer).deploy(
                admin.address,
                token.address,
                merkleRoot
            )) as MerkleDistributor;
            await distributor.deployed();

            await token.connect(admin).transfer(new_distributor.address, expected_total)

        });

        it(' should give correct proof for claims', async () => {

            expect(token_total).to.be.eq(expected_total)

            for (let account in claims) {
                const claim = claims[account];
                await expect(
                    new_distributor.claim(
                        claim.index,
                        account,
                        claim.amount,
                        claim.proof
                    )
                ).to.emit(new_distributor, "Claimed")
                    .withArgs(claim.index, account, claim.amount);
            }

            expect(await token.balanceOf(new_distributor.address)).to.be.eq(0);

        });

        it(' should not allow double claims', async () => {

            const user1_claim = claims[user1.address]

            await expect(
                new_distributor.claim(
                    user1_claim.index,
                    user1.address,
                    user1_claim.amount,
                    user1_claim.proof
                )
            ).to.emit(new_distributor, "Claimed")
                .withArgs(user1_claim.index, user1.address, user1_claim.amount);

            await expect(
                new_distributor.claim(
                    user1_claim.index,
                    user1.address,
                    user1_claim.amount,
                    user1_claim.proof
                )
            ).to.be.revertedWith("AlreadyClaimed");

        });

    });

});
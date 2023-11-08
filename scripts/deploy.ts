export { };
const hre = require("hardhat");
import { BigNumber } from "ethers";

const ethers = hre.ethers;

const network = hre.network.name;

let constant_path = '../utils/constants';
if (network == 'goerli') constant_path = '../utils/goerli-constants'

let deploy_path = '../utils/deploys';
if (network == 'goerli') deploy_path = '../utils/goerli-deploy'
async function main() {

    const deployer = (await hre.ethers.getSigners())[0];

    const ADMIN = "0x0792dCb7080466e4Bbc678Bdb873FE7D969832B8"
    const TOKEN = "0x34635280737b5BFe6c7DC2FC3065D60d66e78185"
    const MERKLE_ROOT = "0x6fba433e2b890ea690cab01e4adcfcb08d348c9088b99060d54f91ee95c063b3"

    const MerkleDistributor = await ethers.getContractFactory("MerkleDistributor");

    console.log('Deploying MerkleDistributor  ...')
    const distributor = await MerkleDistributor.deploy(
        ADMIN,
        TOKEN,
        MERKLE_ROOT
    )
    await distributor.deployed()
    console.log('MerkleDistributor : ', distributor.address)
    console.log()

    await distributor.deployTransaction.wait(15);

    await hre.run("verify:verify", {
        address: distributor.address,
        constructorArguments: [
            ADMIN,
            TOKEN,
            MERKLE_ROOT
        ],
    });

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
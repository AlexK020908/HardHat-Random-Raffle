const { ethers, network } = require("hardhat")
fs = require("fs")

//write a script that is connected to the front end
const FRONT_END_ADD_FILE = "../next-js-smart-raffle/constants/contractAddresses.json"
const FRONT_end_ABI_FILE = "../next-js-smart-raffle/constants/abi.json"
module.exports = async function () {
    if (process.env.UPDATE_FRONT_END) {
        console.log("updating front end ")
        console.log(`CHAINid : ${network.config.chainId}`)
        await updateContractAddresses()
        await updateABI()
    }
}

async function updateContractAddresses() {
    const raffle = await ethers.getContract("Raffle")
    console.log(`CHAINid : ${network.config.chainId}`)
    //we do not need to specify a second paramter, as we do not wish to make changes to the blockchian
    const currAdd = JSON.parse(fs.readFileSync(FRONT_END_ADD_FILE, "utf8"))
    if (network.config.chainId.toString() in currAdd) {
        //make sure the network we are running on is in that location in our front end
        //check if our chainId is already included
        if (!currAdd[network.config.chainId.toString()].includes(raffle.address)) {
            currAdd[network.config.chainId.toString()].push(raffle.address)
        }
    } else {
        //if the chainId we are running on is not included ,
        //simply initlaize a new one
        currAdd[network.config.chainId] = [raffle.address]
    }

    //finally write it back to the file
    fs.writeFileSync(FRONT_END_ADD_FILE, JSON.stringify(currAdd))
}

async function updateABI() {
    const raffle = await ethers.getContract("Raffle") //if we didn't specify a signer --> will return the deployer by default --> the first element in the signers array
    fs.writeFileSync(FRONT_end_ABI_FILE, raffle.interface.format(ethers.utils.FormatTypes.json))
}
module.exports.tags = ("all", "frontend")

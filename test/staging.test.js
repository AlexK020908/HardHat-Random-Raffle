const { ethers, getNamedAccounts, network, deployments } = require("hardhat")
const { assert, expect } = require("chai")
const { developmentChains, networkConfig } = require("../helper-hardhat-config")

//first check
developmentChains.includes(network.name)
    ? describe.skip
    : describe("Smart Raffle", function () {
          //variblaes
          let raffle
          //first we need to deploy with beforeEach
          let deployer
          let entranceFee
          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              //   await deployments.fixture(["all"]) --> no need for this as when we run out deploy script --> it will already be deployed

              //mock and raffle
              raffle = await ethers.getContract("Raffle", deployer) //deploy the contract with deployer as the deployer
              entranceFee = await raffle.getEntraceFee()
          })

          describe("fullfillrandomwords", function () {
              it("works with live chianlink keepers and VRF, get a random number", async function () {
                  //we need to enter raffle --> nothing else since chianlink keepers and vrf will start the raffle for us
                  const accounts = await ethers.getSigners() //question --> does getsigners get the deployer as well ? why
                  console.log("setting up accounts and starting time stamp")
                  const startingTimeStamp = await raffle.getLatestTimeStamp()

                  //set up listeners before we enter raffle
                  await new Promise(async (resolve, reject) => {
                      console.log("setting up listenr...S")
                      raffle.once("winnerpicked", async () => {
                          console.log("winner picked event fired")
                          try {
                              //let us get the recent winer
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getrafflestate()
                              const winnerBalance = await accounts[0].getBalance()
                              const endingTimeStamp = await raffle.getLatestTimeStamp()
                              console.log(`winner ending balance : ${winnerBalance}`)
                              await expect(raffle.getPlayer(0)).to.be.reverted
                              assert.equal(recentWinner, accounts[0].address)
                              assert.equal(raffleState.toString(), "0")
                              assert.equal(
                                  winnerBalance.toString(),
                                  winnerStartingBalance.add(entranceFee).toString()
                              )
                              assert(startingTimeStamp > endingTimeStamp)
                              resolve()
                          } catch (error) {
                              console.error(error)
                              reject()
                          }
                      })

                      console.log("entering raffle...")
                      //then entering the raffle --> and this code will not complete
                      //until the listener stopped listening --> "once" keyword
                      const tx = await raffle.enterRaffle({ value: entranceFee })
                      //get the starting balance
                      console.log("waiting for one block confirmation")
                      await tx.wait(1) //we need to await tx.wait(3) becuase this only goes on when the wait confirmation finishes
                      const winnerStartingBalance = await accounts[0].getBalance()
                      console.log(`starting balance is : ${winnerStartingBalance}`)
                  })
              })
          })
      })

//how to run the stagin test
/*
      1. get sub ID from chainklink VRF UI
      2. deploy our contract using SUBID
            yarn hardhat deploy --network rinkeby
      3. register the contract with chainlink VRF and its subid
            to do this , go to https://vrf.chain.link/rinkeby/8770
            then add consumer address, which is the contract address we deploiyed to 

      4.resiger the contract with chainlink keepers, so it can start raffle at given intervals
            to do this, go to keepers.chain.link
            add a new project --> put in deployed address
      5. run staging tests 
            now we can run staging test 
            yarn hardhat test --network rinkeby


      */

const { ethers, getNamedAccounts, network, deployments } = require("hardhat")
const { assert, expect } = require("chai")
const { developmentChains, networkConfig } = require("../helper-hardhat-config")

//first check
!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Smart Raffle", function () {
          //variblaes
          let raffle
          //first we need to deploy with beforeEach
          let deployer
          let entranceFee
          let VRFCoordinatorV2Mock
          let interval
          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"]) //dploy all contracts including
              //mock and raffle
              raffle = await ethers.getContract("Raffle", deployer) //deploy the contract with deployer as the wallet that deployed the deployer
              VRFCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              entranceFee = await raffle.getEntraceFee()
              interval = await raffle.getInterval()
          })

          describe("constructor", function () {
              it("initializes the raffle correctly", async function () {
                  const raffleState = await raffle.getrafflestate() //uint256 --> big number
                  assert.equal(raffleState.toString(), "0")

                  const entranceFee = await raffle.getEntraceFee()
                  assert.equal(networkConfig[31337]["entranceFee"], entranceFee.toString())

                  const gasLane = await raffle.getgasLane()
                  assert.equal(networkConfig[31337]["gasLane"], gasLane.toString())
              })
          })

          describe("entering raffle", function () {
              //first test is throws an error with msg.value < i_entracefee
              it("not enough eth", async function () {
                  await expect(raffle.enterRaffle()).to.be.reverted
              })

              it("passes if enought eath is sent", async function () {
                  await raffle.enterRaffle({ value: entranceFee })
                  //check if sender is in players
                  //get the players first
                  const player = await raffle.getPlayer(0)
                  assert.equal(player, deployer)
              })

              //how can we test events ?
              it("emits events on enter", async function () {
                  await expect(raffle.enterRaffle({ value: entranceFee })).to.emit(
                      raffle,
                      "RaffleEnter"
                  )
              })

              //how we can test if we can enter or not if raffle is nto open?
              //we need to have checkUpKeep return true so that when we call
              //perform up keep --> the state will be closed, otherwise we will get
              //reverted with error

              /*
                hardhat network --> reference --> scroll down 
                hardhat_network_methods 
                we can test any scenario

                evm_increaseTime--> we can increase time 
                evm_mine --> we can create new blocks 

                we want to mine cuz we want a new block to be mined  
              */
              it("no entrance allowed when raffle is calculating", async function () {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", []) //just want to mine one extra block
                  //time has passed --> so we can call perform upkeep since checkup keep will return true

                  await raffle.performUpkeep([])
                  //now it is in a caluilating state
                  await expect(raffle.enterRaffle({ value: entranceFee })).to.be.revertedWith(
                      "Raffle_closed"
                  )
              })
          })

          describe("check up keep", function () {
              it("returns false if no one is in the game", async function () {
                  //we want everything in check up keep to be true except for has players
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", []) //just want to mine one extra block
                  //calling check up keep would send a tx , we do not want that, we can use callstatic
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)
              })

              it("returns false if raffle is not open", async function () {
                  //first have time pass
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.performUpkeep("0x")

                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert.equal(upkeepNeeded, false)
              })

              it("returns false if not enough time has passed", async function () {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 10])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)
              })

              it("returns true if everything else is true", async function () {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert(upkeepNeeded)
              })
          })

          describe("perform up keep", function () {
              it("it can only run if checkupkeep is true", async function () {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  //since everything is satified
                  const tx = await raffle.performUpkeep([])
                  //if tx does not work , tx will fail
                  assert(tx)
              })

              it("revert is up keep is not needed", async function () {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 1])
                  await network.provider.send("evm_mine", [])
                  expect(raffle.performUpkeep([])).to.be.reverted
              })

              it("updates raffle state, emits an event and calls the VRF coodinator with request", async function () {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  //since everything is satified
                  const tx = await raffle.performUpkeep([])
                  const reciept = await tx.wait(1)
                  const requestid = reciept.events[1].args.requestId //since requestrandomwords also emits an event
                  const rafflestate = await raffle.getrafflestate()
                  assert(requestid.toNumber() > 0)
                  assert(tx)
                  assert.equal(rafflestate, 1)
                  await expect(tx).to.emit(raffle, "requestedRaffleWinner")
              })
          })

          describe("fullfilll random words", function () {
              //we need a before each here becuase we want someone in the pot,
              //so we can call perform upkeep without reversion

              beforeEach(async function () {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
              })

              it("can only be called after performupkeep", async function () {
                  expect(VRFCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)).to.be.reverted
              })

              it("picks a winner, resets the lott, and send money", async function () {
                  //we need more entrants
                  const additionalEntrants = 3
                  const startingAccountIndex = 1 //deployer = 0;
                  const accounts = await ethers.getSigners()
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      //connect raffle contracts to these accounts
                      const accountConnectedRaffle = raffle.connect(accounts[i])
                      accountConnectedRaffle.enterRaffle({ value: entranceFee })
                  }

                  //now we have four ppl connected

                  const startingtimeStamp = await raffle.getLatestTimeStamp()
                  //we want to perform upkeep --> MOCK chainlink
                  //requesting random words will kick of calling fulffil random words(mock the VRF)
                  //we have to wait for fulfillrandom words to be called --> we need to simulate waiting for it since local host isnt the same
                  //as the VRF
                  //using promises

                  //we set up the event listeners first
                  await new Promise(async (resolve, reject) => {
                      //once winner picked, we want to do something
                      raffle.once("winnerpicked", async () => {
                          console.log("found the event")
                          try {
                              console.log("getting winner")
                              const recentwinner = await raffle.getRecentWinner()
                              console.log("getting rafflestate")
                              const raffleState = await raffle.getrafflestate()
                              console.log("getting time stamp ")
                              const endingTimeStamp = await raffle.getLatestTimeStamp()
                              const numplayers = await raffle.getNumberOfPlayers()
                              const winnerEndingBalance = await accounts[1].getBalance()
                              console.log(`recent winner ${recentwinner}`) //recent winner is already an address
                              console.log(accounts[0].address)
                              console.log(accounts[1].address)
                              console.log(accounts[2].address)
                              console.log(accounts[3].address)
                              assert.equal(raffleState, 0)
                              assert(endingTimeStamp > startingtimeStamp)
                              assert.equal(numplayers.toString(), "0")
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(
                                      entranceFee
                                          .mul(additionalEntrants) //the numebr of other entrants
                                          .add(entranceFee) //add the entrace fee for himself
                                          .toString()
                                  )
                              )
                              resolve()
                          } catch (error) {
                              reject(e)
                          }
                      })

                      //then we add the code inside the promise but outside the once
                      //so that the code we run here may trigger fullfill random words
                      //then emit the event winner picked.
                      const tx = await raffle.performUpkeep("0x")
                      const txReceipt = await tx.wait(1)
                      const winnerStartingBalance = await accounts[1].getBalance()
                      await VRFCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address
                      )

                      //we do not have these section on the bottom for testnet staging test becuase
                      //we do not know fulfillrandom words is gonna be called, so its best to set up a listener
                      //here we are pretending to be the chainlink keeper --> which is why we need a mock

                      /*
                            question to ask :
                                why I move the line  const winnerStartingBalance = await accounts[1].getBalance() inside the promise, the test does not work 
                                why?


                      */
                  })
              })
          })
      })

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;
import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
//we use chainlink oracle for randomness, automated exectution(chainlink keeper)
error Raffle__NotEnoughEth();
error Raffle_transferFailed();
error Raffle_closed();
error Raffle_upKeepNotNeeded(uint256 currentBalance, uint256 numplayers, uint256 rafflestate);

//we need to make it
//this implements chianlink v2 and chainlink keepers
contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    enum RaffleState {
        OPEN,
        CALCULATING
    }
    uint256 private immutable i_entraceFee;
    address payable[] private s_players; //payable since we want to pay them if they win
    VRFCoordinatorV2Interface private immutable i_COORDINATOR;
    //events
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint16 private constant requestConfirmations = 3;
    uint32 private immutable i_callbackgaslimit;
    uint32 private constant numWords = 1;
    uint256 private s_lastTimeStamp;
    uint256 private constant c_interval = 30;
    event requestedRaffleWinner(uint256 indexed requestId);
    event RaffleEnter(address indexed player);
    event winnerpicked(address indexed winner);

    address payable private s_recentWinner;
    RaffleState private s_raffleState;

    //VRFCoordinatorV2 is where we generate the random number (the address where we are going to generate the number !)
    constructor(
        uint256 entranceFee,
        address VRFCoordinatorV2, //contract address --> probably need a mock for this ....
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit
    ) VRFConsumerBaseV2(VRFCoordinatorV2) {
        //since we only set it once, we can make it immutable
        i_entraceFee = entranceFee;
        i_COORDINATOR = VRFCoordinatorV2Interface(VRFCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackgaslimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
    }

    function enterRaffle() public payable {
        if (msg.value < i_entraceFee) {
            revert Raffle__NotEnoughEth();
        }

        if (s_raffleState != RaffleState.OPEN) {
            revert Raffle_closed();
        }

        s_players.push(payable(msg.sender)); //keep tracking of all the players entering our raffle
        //we need to event when we update a dynamic array
        /*
            events are tied to a smart contract  ---> solves the polling issue (cs213!)
                    --> better than consistently reading var to see if we need to do something


            topic = indexed parameter --> index parameters are easier to search for (to query)
            non indexed one is harder to search 
        */
        emit RaffleEnter(msg.sender); //when an event is emitted, it stores the arguments passed in transaction logs, fast to acess sincce it is indexed
        //logs are outsiden of the contract ... (a data structure) but a log is only uniquely connected to one smart contract
    }

    /**
    *@dev alex kang 
    this is the function chainlink keeper calls, they look for the upkeepneeded 
    the following should be true in order to return true
        1. TIME INTERVAL SHOULD BE PASSED
        2. lottery should have at least 1 player and some eth 
        3.subscription funded with LINK
        4. LOTTERY should be in an "open" state --> when we are waiting for the number to get back
        we are in a closed state 
    
     */
    function checkUpkeep(
        bytes memory /* checkData */
    )
        public
        view
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData */
        )
    {
        bool isOpen = s_raffleState == RaffleState.OPEN;
        // block.timeStamp gives the current time, in order to get the time passed
        //we could do something like block.timeStamp - prevTimeStamp(we neeod a variable for this )
        bool timepassed = ((block.timestamp - s_lastTimeStamp)) > c_interval;
        bool hasplayers = (s_players.length > 0);
        bool hasBalance = address(this).balance > 0;
        upkeepNeeded = isOpen && timepassed && hasplayers && hasBalance;
    }

    //we want chainlink keeper to call this so we do not have call it ourselvrsd
    //before we had it as requestRandomWinner, but in keepers we had to have a
    //performUpkeep, u might as well switch the name to perform upkeep
    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        //request random number
        //once we get it --> do smt with it
        // 2 trasaction process --> fair
        //before we call perform up keep we need to check if checkupkeep is true
        (bool upkeepNeeded, ) = checkUpkeep(""); //since we do not use calldata, and since we only want the bool, we just pull that one out
        if (!upkeepNeeded) {
            revert Raffle_upKeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        }

        s_raffleState = RaffleState.CALCULATING;
        uint256 requestid = i_COORDINATOR.requestRandomWords( //calling it on the coordinator
            i_gasLane, //gaslane
            i_subscriptionId,
            requestConfirmations,
            i_callbackgaslimit,
            numWords
        );

        emit requestedRaffleWinner(requestid); //save request id to logs
    }

    //in chainlink contracts src v0.8 --> fullfillRandomWords is virtual meaning we can ovvereide it
    function fulfillRandomWords(
        uint256, /*requestId*/
        uint256[] memory randomWords
    ) internal override {
        //since we only requesting one randomness, randomwords will come back as size 1
        //we can use modular operator
        //if s_players is of size 10
        //and we have random number == 202
        // we can 202 % 10   == 2 --> 2th winner
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable winner = s_players[indexOfWinner];
        s_recentWinner = winner;
        s_lastTimeStamp = block.timestamp;
        s_players = new address payable[](0);
        (bool success, ) = winner.call{value: address(this).balance}("");
        if (!success) {
            revert Raffle_transferFailed();
        }

        emit winnerpicked(winner);
        s_raffleState = RaffleState.OPEN;
    }

    /*
        notes about chainlink VRF v2 

        getting a random number --> you need a subcription 


    */
    function getEntraceFee() public view returns (uint256) {
        return i_entraceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getrafflestate() public view returns (RaffleState) {
        return s_raffleState;
    }

    //the reason why it is pure is because numwords is a constant
    function getNumWords() public pure returns (uint256) {
        return numWords;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getLatestTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestConfirmations() public pure returns (uint256) {
        return requestConfirmations;
    }

    function getgasLane() public view returns (bytes32) {
        return i_gasLane;
    }

    function getInterval() public pure returns (uint256) {
        return c_interval;
    }
}

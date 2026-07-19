// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ILiquid} from "./interfaces/ILiquid.sol";

/// @title CardVault — card ownership + the burn economy for Upperdeck Ripmaster 3030
/// @notice The deck as on-chain items. One contract holds every card as an ERC-1155
/// id (many copies of a common, exactly one of the marquee), and every way a card
/// changes hands runs through it — send, trade, wager, rip. The house rule is the
/// whole economy: **every transaction burns the liquid token**. There is no fee
/// wallet and no treasury; tolls are pulled from the caller and destroyed, so all
/// activity is deflation, and deflation is burn progress the renderer already reads.
///
///   send      — gift a card to another player            (burns SEND toll)
///   trade     — atomic card-for-card swap between two players (burns TRADE toll, both sides)
///   wager     — pog-stack escrow for the arena: 1/2/3/4/7 cards a side,
///               winner collects the loser's stack        (burns WAGER toll each side)
///   ripPack   — burn the pack price, mint 7 cards weighted by rarity
///
/// The MARQUEE (Lovebeing, id 1000, supply 1) is the one exception to play, not to
/// the burn rule: it can never be wagered and never burned — hold, trade, send,
/// exchange only, each transfer burning the (steeper) marquee toll — and it stays
/// sealed in the vault until `marqueeUnlockSeason` opens.
///
/// Testnet-grade randomness (prev-blockhash) is used for pack pulls — swap for VRF
/// before mainnet. Battle resolution is reported by the resolver key (the site's
/// gas-trigger engine signs results server-side for now; see docs/CARD-ECONOMY-SPEC.md
/// for the path to trustless resolution). Deploy per docs/TESTNET.md §5.
contract CardVault is ERC1155 {
    // ─── the cast ───
    ILiquid public immutable token;          // the liquid edition ($UR3030) — the thing that burns
    address public curator;                  // opens seasons, registers cards, sets tolls
    address public resolver;                 // reports arena results (testnet: the site's engine)

    // ─── cards ───
    uint256 public constant MARQUEE_ID = 1000;
    uint32  public currentSeason;
    uint32  public marqueeUnlockSeason;      // marquee transfers revert before this season

    enum Tier { Common, Uncommon, Rare, Mythic, Prizm }
    struct CardInfo { uint32 season; Tier tier; bool exists; }
    mapping(uint256 => CardInfo) public cardInfo;          // id => info (id = deck number)
    mapping(uint32 => mapping(uint8 => uint256[])) private _pool; // season => tier => ids (pack pulls)

    // ─── the burn schedule (all 18-decimals $UR3030, all destroyed on use) ───
    uint256 public sendToll    = 1e18;       // gift a card
    uint256 public tradeToll   = 1e18;       // per side of a swap
    uint256 public wagerToll   = 2e18;       // per side of an arena match
    uint256 public marqueeToll = 25e18;      // moving the 1/1 costs real conviction
    uint256 public packPrice   = 10e18;      // rip rights for a 7-card pack

    // ─── arena escrow ───
    struct Match {
        address a; address b;
        uint256[] stakeA; uint256[] stakeB;  // card ids escrowed, 1/2/3/4/7 per side
        bool open; bool resolved;
    }
    uint256 public nextMatch = 1;
    mapping(uint256 => Match) public matches;

    uint256 private _nonce;                  // pack randomness (testnet-grade)

    // ─── the rarity court: standing promote/demote burn-votes on every card ───
    // Net conviction is signed burned supply: promote adds, demote subtracts.
    // Crossing the current tier's step cost moves the card one rung and consumes
    // that much conviction; demoted past Common the card is RETIRED — voted off
    // the island (no packs, no arena; still holdable/tradable). Promote votes can
    // bring a retired card back. The ballot never closes.
    mapping(uint256 => int256) public rarityNet;
    mapping(uint256 => bool) public retired;

    event RarityVote(uint256 indexed id, address indexed voter, bool up, uint256 amount);
    event RarityShifted(uint256 indexed id, Tier newTier);
    event CardRetired(uint256 indexed id);
    event CardRestored(uint256 indexed id);

    // ─── events: the provenance feed the card backs read ───
    event CardSent(address indexed from, address indexed to, uint256 indexed id, uint256 burned);
    event CardsTraded(address indexed a, address indexed b, uint256 idA, uint256 idB, uint256 burned);
    event MatchOpened(uint256 indexed matchId, address indexed a, uint256[] stakeA);
    event MatchJoined(uint256 indexed matchId, address indexed b, uint256[] stakeB);
    event MatchResolved(uint256 indexed matchId, address indexed winner, uint256 burned);
    event PackRipped(address indexed player, uint256[] ids, uint256 burned);
    event MarqueeMoved(address indexed from, address indexed to, uint256 burned);

    error NotCurator();
    error NotResolver();
    error MarqueeSealed();                   // before unlock season
    error MarqueeNotPlayable();              // wager/burn attempts
    error BadStackSize();                    // pog stacks are 1/2/3/4/7 only
    error MatchState();
    error UnknownCard();
    error ZeroAmount();

    modifier onlyCurator() { if (msg.sender != curator) revert NotCurator(); _; }

    constructor(ILiquid _token, string memory uri_) ERC1155(uri_) {
        token = _token;
        curator = msg.sender;
        resolver = msg.sender;
        marqueeUnlockSeason = 3;             // "not released till later seasons"
        _mint(address(this), MARQUEE_ID, 1, ""); // the 1/1 waits in the vault
    }

    // ─── the one rule: pull it, burn it ───
    function _burnToll(address payer, uint256 amount) internal {
        require(token.transferFrom(payer, address(this), amount), "toll");
        token.burn(amount);
    }

    /// @dev All card movement goes through the vault's named actions so no path
    /// can skip the toll. Bare ERC-1155 transfers are closed off.
    function safeTransferFrom(address, address, uint256, uint256, bytes memory) public pure override {
        revert("use sendCard / trade / wager");
    }
    function safeBatchTransferFrom(address, address, uint256[] memory, uint256[] memory, bytes memory)
        public pure override
    {
        revert("use sendCard / trade / wager");
    }

    // ─── curator: register the deck, run the calendar ───

    function registerCards(uint256[] calldata ids, uint32 season, Tier[] calldata tiers)
        external onlyCurator
    {
        require(ids.length == tiers.length, "len");
        for (uint256 i = 0; i < ids.length; i++) {
            cardInfo[ids[i]] = CardInfo(season, tiers[i], true);
            _pool[season][uint8(tiers[i])].push(ids[i]);
        }
    }

    function setSeason(uint32 s) external onlyCurator { currentSeason = s; }
    function setResolver(address r) external onlyCurator { resolver = r; }
    function setTolls(uint256 s, uint256 t, uint256 w, uint256 m, uint256 p) external onlyCurator {
        sendToll = s; tradeToll = t; wagerToll = w; marqueeToll = m; packPrice = p;
    }

    // ─── send: a gift still feeds the fire ───

    function sendCard(address to, uint256 id) external {
        if (id == MARQUEE_ID) { _moveMarquee(msg.sender, to); return; }
        if (!cardInfo[id].exists) revert UnknownCard();
        _burnToll(msg.sender, sendToll);
        _safeTransferFrom(msg.sender, to, id, 1, "");
        emit CardSent(msg.sender, to, id, sendToll);
    }

    /// @notice Atomic card-for-card swap. `b` signs off by having approved the
    /// vault for their toll; both tolls burn in the same breath as the swap.
    function trade(address b, uint256 idA, uint256 idB) external {
        if (idA == MARQUEE_ID || idB == MARQUEE_ID) revert MarqueeNotPlayable(); // 1/1 moves via sendCard only
        if (!cardInfo[idA].exists || !cardInfo[idB].exists) revert UnknownCard();
        _burnToll(msg.sender, tradeToll);
        _burnToll(b, tradeToll);
        _safeTransferFrom(msg.sender, b, idA, 1, "");
        _safeTransferFrom(b, msg.sender, idB, 1, "");
        emit CardsTraded(msg.sender, b, idA, idB, tradeToll * 2);
    }

    function _moveMarquee(address from, address to) internal {
        if (currentSeason < marqueeUnlockSeason) revert MarqueeSealed();
        _burnToll(from, marqueeToll);
        _safeTransferFrom(from, to, MARQUEE_ID, 1, "");
        emit MarqueeMoved(from, to, marqueeToll);
    }

    /// @notice One-time hand-off of the sealed 1/1 to its first keeper (still tolls).
    function releaseMarquee(address to) external onlyCurator {
        if (currentSeason < marqueeUnlockSeason) revert MarqueeSealed();
        _safeTransferFrom(address(this), to, MARQUEE_ID, 1, "");
        emit MarqueeMoved(address(this), to, 0);
    }

    // ─── the arena: pog stacks in escrow, winner collects ───

    function _checkStack(uint256[] calldata ids) private view {
        uint256 n = ids.length;
        if (!(n == 1 || n == 2 || n == 3 || n == 4 || n == 7)) revert BadStackSize();
        for (uint256 i = 0; i < n; i++) {
            if (ids[i] == MARQUEE_ID) revert MarqueeNotPlayable();
            if (!cardInfo[ids[i]].exists) revert UnknownCard();
            if (retired[ids[i]]) revert UnknownCard();   // voted off = not playable
        }
    }

    function openMatch(uint256[] calldata stake) external returns (uint256 matchId) {
        _checkStack(stake);
        _burnToll(msg.sender, wagerToll);
        matchId = nextMatch++;
        Match storage m = matches[matchId];
        m.a = msg.sender; m.stakeA = stake; m.open = true;
        for (uint256 i = 0; i < stake.length; i++) _safeTransferFrom(msg.sender, address(this), stake[i], 1, "");
        emit MatchOpened(matchId, msg.sender, stake);
    }

    function joinMatch(uint256 matchId, uint256[] calldata stake) external {
        Match storage m = matches[matchId];
        if (!m.open || m.b != address(0)) revert MatchState();
        if (stake.length != m.stakeA.length) revert BadStackSize(); // like-for-like pogs
        _checkStack(stake);
        _burnToll(msg.sender, wagerToll);
        m.b = msg.sender; m.stakeB = stake;
        for (uint256 i = 0; i < stake.length; i++) _safeTransferFrom(msg.sender, address(this), stake[i], 1, "");
        emit MatchJoined(matchId, msg.sender, stake);
    }

    /// @notice The resolver reports the outcome the trigger engine computed
    /// (gas weather + ATK/DEF + combos — the same math as cards/battle.html).
    /// Winner takes both stacks out of escrow.
    function resolveMatch(uint256 matchId, address winner) external {
        if (msg.sender != resolver) revert NotResolver();
        Match storage m = matches[matchId];
        if (!m.open || m.b == address(0) || m.resolved) revert MatchState();
        if (winner != m.a && winner != m.b) revert MatchState();
        m.resolved = true; m.open = false;
        for (uint256 i = 0; i < m.stakeA.length; i++) _safeTransferFrom(address(this), winner, m.stakeA[i], 1, "");
        for (uint256 i = 0; i < m.stakeB.length; i++) _safeTransferFrom(address(this), winner, m.stakeB[i], 1, "");
        emit MatchResolved(matchId, winner, wagerToll * 2);
    }

    /// @notice Walk away before anyone joins; stack comes home (toll stays burned).
    function cancelMatch(uint256 matchId) external {
        Match storage m = matches[matchId];
        if (!m.open || m.b != address(0) || msg.sender != m.a) revert MatchState();
        m.open = false;
        for (uint256 i = 0; i < m.stakeA.length; i++) _safeTransferFrom(address(this), m.a, m.stakeA[i], 1, "");
    }

    // ─── the rarity court: any holder, any card, any time ───

    /// @notice The price of moving one rung, up or down, from tier `t`.
    /// Climbing gets steeper the higher you go; falling out of prizm costs the
    /// same conviction it took to get in, so griefing the top is expensive.
    function stepCost(Tier t) public pure returns (uint256) {
        if (t == Tier.Common) return 50e18;
        if (t == Tier.Uncommon) return 150e18;
        if (t == Tier.Rare) return 500e18;
        return 2000e18;                      // Mythic <-> Prizm, both directions
    }

    /// @notice Burn `amount` to vote a card up (promote) or down (demote).
    /// Votes settle immediately: cross the bar and the card moves that block.
    function voteRarity(uint256 id, bool up, uint256 amount) external {
        if (id == MARQUEE_ID) revert MarqueeNotPlayable();
        if (!cardInfo[id].exists) revert UnknownCard();
        if (amount == 0) revert ZeroAmount();
        _burnToll(msg.sender, amount);
        rarityNet[id] += up ? int256(amount) : -int256(amount);
        emit RarityVote(id, msg.sender, up, amount);
        _settleRarity(id);
    }

    function _settleRarity(uint256 id) internal {
        CardInfo storage info = cardInfo[id];
        int256 net = rarityNet[id];
        // revival first: a retired card claws back in at the Common bar
        if (retired[id] && net >= int256(stepCost(Tier.Common))) {
            net -= int256(stepCost(Tier.Common));
            retired[id] = false;
            emit CardRestored(id);
        }
        // climb while conviction clears each bar
        while (!retired[id] && info.tier != Tier.Prizm && net >= int256(stepCost(info.tier))) {
            net -= int256(stepCost(info.tier));
            info.tier = Tier(uint8(info.tier) + 1);
            emit RarityShifted(id, info.tier);
        }
        // fall while scorn clears each bar; falling past Common retires the card
        while (!retired[id] && net <= -int256(stepCost(info.tier))) {
            net += int256(stepCost(info.tier));
            if (info.tier == Tier.Common) { retired[id] = true; emit CardRetired(id); break; }
            info.tier = Tier(uint8(info.tier) - 1);
            emit RarityShifted(id, info.tier);
        }
        rarityNet[id] = net;
    }

    // ─── rip a pack: burn the price, pull 7 by rarity weight ───
    // weights mirror the site's pack.js: common 48 / uncommon 30 / rare 15 / mythic 6 / prizm 1

    function ripPack() external returns (uint256[] memory ids) {
        _burnToll(msg.sender, packPrice);
        ids = new uint256[](7);
        bytes32 seed = keccak256(abi.encodePacked(blockhash(block.number - 1), msg.sender, _nonce++));
        for (uint256 i = 0; i < 7; i++) {
            seed = keccak256(abi.encodePacked(seed, i));
            uint8 tier = _rollTier(uint256(seed) % 100);
            // draw at the card's CURRENT tier (the rarity court moves cards between
            // tiers after registration) and skip anything voted off; walk down the
            // tiers when the rolled one is empty.
            uint256 id = 0;
            for (uint8 t = tier + 1; t > 0 && id == 0; t--) {
                id = _drawCurrentTier(t - 1, uint256(seed) / 100);
            }
            require(id != 0, "season empty");
            ids[i] = id;
            _mint(msg.sender, id, 1, "");
        }
        emit PackRipped(msg.sender, ids, packPrice);
    }

    function _rollTier(uint256 roll) private pure returns (uint8) {
        if (roll < 48) return 0;             // common
        if (roll < 78) return 1;             // uncommon
        if (roll < 93) return 2;             // rare
        if (roll < 99) return 3;             // mythic
        return 4;                            // prizm
    }

    /// @dev Uniform pick among registered cards whose CURRENT tier is `want`
    /// (registration pools are the census; tier and retirement checked live).
    /// Two O(deck) scans — fine for a testnet deck; mainnet wants pools that
    /// are re-indexed on every RarityShifted (see CARD-ECONOMY-SPEC.md).
    function _drawCurrentTier(uint8 want, uint256 rand) private view returns (uint256) {
        uint256 count;
        for (uint8 p = 0; p < 5; p++) {
            uint256[] storage pool = _pool[currentSeason][p];
            for (uint256 i = 0; i < pool.length; i++)
                if (!retired[pool[i]] && uint8(cardInfo[pool[i]].tier) == want) count++;
        }
        if (count == 0) return 0;
        uint256 kth = rand % count;
        for (uint8 p = 0; p < 5; p++) {
            uint256[] storage pool = _pool[currentSeason][p];
            for (uint256 i = 0; i < pool.length; i++)
                if (!retired[pool[i]] && uint8(cardInfo[pool[i]].tier) == want) {
                    if (kth == 0) return pool[i];
                    kth--;
                }
        }
        return 0;
    }

    // ─── reads for the site / card backs ───

    function stakes(uint256 matchId) external view returns (uint256[] memory a, uint256[] memory b) {
        return (matches[matchId].stakeA, matches[matchId].stakeB);
    }

    function poolSize(uint32 season, uint8 tier) external view returns (uint256) {
        return _pool[season][tier].length;
    }
}

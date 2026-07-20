// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ILiquid} from "./interfaces/ILiquid.sol";

/// @title CardVault — card ownership + the burn economy for upperdeckripmaster3030
/// @notice The deck as on-chain items. One contract holds every card as an ERC-1155
/// id (many copies of a common, exactly one of the marquee), and every way a card
/// changes hands runs through it — send, trade, wager, rip. The house rule is the
/// economy, and it splits by intent:
///
///   CONSTRUCTIVE acts pay the CREATOR (not burned) — championing art:
///     upvote    — promote a card in the rarity court      (vote amount → creator)
///     hodl      — ⛨ anchor / prizm upvote                 (vote amount → creator)
///
///   Everything else BURNS the liquid token — circulation and destruction:
///     send      — gift a card to another player            (burns SEND toll)
///     trade     — atomic card-for-card swap                (burns TRADE toll, both sides)
///     wager     — pog-stack escrow for the arena           (burns WAGER toll each side)
///     ripPack   — mint 7 cards weighted by rarity          (burns PACK price)
///     downvote  — demote / vote a card off the island      (burns vote amount)
///     destroy   — corner a whole edition, burn every copy  (burns cards + toll)
///
/// There is still no treasury: burns are destroyed, and the creator cut is a
/// transparent, transfer-based royalty on creation and conviction. Burns remain
/// burn progress the renderer reads; the creator stream aligns the artist with
/// the deck they made.
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
    address public creator;                  // receives the constructive cut (forge / upvote / hodl)

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
    // packPrice is NOT a fixed toll — packs are the premium on-ramp and their
    // price floats on the season's dwindling allotment. See the pack economy
    // block below and the packPrice() view.

    // ─── the seasonal pack allotment: dwindling supply, escalating price ───
    // A pack is the one premium action (~$7 to enter with 7 cards); every other
    // move stays cheap. Packs are the ONLY way to mint card copies — 7 to a pack —
    // so each season's PACK ALLOTMENT is its card-copy budget over 7. The price of
    // a pack is not fixed: it rises along a straight line from packBase (the
    // season's first rip) to packCeil (its last), indexed by how much of the card
    // budget has been ripped. And because the field is burned DOWN toward the
    // 77-survivor deck, every season opens with a SMALLER card budget and a HIGHER
    // floor than the last — packs get scarcer and dearer the deeper the game runs.
    // packBase/packCeil are $UR3030 amounts, recalibrated by the curator at each
    // openSeason to track the USD target ($7 opening, rising) against live price.
    uint256 public constant CARDS_PER_PACK = 7;
    uint256 public seasonCardBudget;         // card copies mintable via packs this season (0 = uncapped)
    uint256 public cardsIssued;              // copies minted via packs this season
    uint256 public packBase = 350e18;        // pack price at the season's first rip   (≈ $7 at launch)
    uint256 public packCeil = 525e18;        // pack price once the allotment is spent  (≈ $10.50, ×1.5)

    // ─── the burn-down: a season starts with the full field and is culled ───
    // A season opens with every registered card in play and the community burns
    // it DOWN — downvoting cards off the island (§rarity court) and cornering +
    // destroying editions — until a **standard deck of 77 survivors** remains.
    // The highest-ranked non-survivors seed the next season. When an edition is
    // burned down and its last copy destroyed, the keeper of that final card is
    // rewarded: a payout of $UR3030 FROM THE HOUSE reward pool, plus a minted
    // ASH TROPHY card — a "last of its kind" collectible commemorating the edition.
    uint256 public constant STANDARD_DECK = 77;
    uint256 public nextTrophy = 9000;
    mapping(uint256 => uint256) public trophyForEdition;  // destroyed id => trophy id
    mapping(uint256 => uint256) public trophyEdition;     // trophy id => the id it commemorates
    mapping(uint256 => bool) public isAshTrophy;          // trophy ids (not deck cards)
    event AshTrophy(uint256 indexed editionId, address indexed keeper, uint256 trophyId, uint256 reward);

    // ─── the house reward pool ($UR3030 the vault holds to pay last-standers) ───
    // Not a treasury for an operator: it is a player bounty. A slice of every pack
    // rip seeds it, anyone can top it up (fundReward), and it pays out to whoever
    // ends an edition. Packs (adding cards) fund the bounty for culling cards.
    uint256 public rewardPool;                    // $UR3030 held for last-stander payouts
    uint256 public lastStandingReward = 50e18;    // paid to the keeper who ends an edition
    uint256 public rewardCut = 1e18;              // of each pack price, this seeds the pool

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
    mapping(uint256 => uint256) public hodlBuffer;   // ⛨ anchor: demotes burn through this first
    mapping(uint256 => bool) public retired;

    // ─── consensus retire: it takes a crowd, not a whale ───
    // A card only falls OFF the island (retired) when scorn has both cleared the
    // conviction bar AND been cast by at least `retireQuorum` distinct wallets.
    // One deep-pocketed downvoter can drag a card down the tiers but can never
    // unilaterally delete it — removal is a community verdict.
    mapping(uint256 => mapping(address => bool)) public didDownvote;  // id => wallet => voted down?
    mapping(uint256 => uint32) public downvoterCount;                 // id => distinct downvoters
    uint32 public retireQuorum = 9;                                   // distinct wallets to retire

    // ─── live supply, per id (maintained in _update) ───
    // Enables "corner the edition": own every circulating copy and you may burn
    // them all to destroy the card forever.
    mapping(uint256 => uint256) public supplyOf;
    uint256 public destroyToll = 50e18;              // burned to enact a destruction

    event RarityVote(uint256 indexed id, address indexed voter, bool up, uint256 amount);
    event HodlVote(uint256 indexed id, address indexed voter, uint256 amount);
    event RarityShifted(uint256 indexed id, Tier newTier);
    event CardRetired(uint256 indexed id);
    event CardRestored(uint256 indexed id);
    event CreatorPaid(address indexed from, uint256 indexed id, uint256 amount, bytes32 kind);
    event EditionDestroyed(uint256 indexed id, address indexed by, uint256 copies, uint256 burned);

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
    error NotWholeEdition();                  // destroyEdition needs every copy
    error NotRetired();                       // destroyEdition needs a prior court verdict
    error AllotmentSpent();                   // the season's pack allotment is exhausted

    modifier onlyCurator() { if (msg.sender != curator) revert NotCurator(); _; }

    constructor(ILiquid _token, string memory uri_) ERC1155(uri_) {
        token = _token;
        curator = msg.sender;
        resolver = msg.sender;
        creator = msg.sender;               // artist wallet; retarget with setCreator
        marqueeUnlockSeason = 3;             // "not released till later seasons"
        _mint(address(this), MARQUEE_ID, 1, ""); // the 1/1 waits in the vault
    }

    /// @dev Track live per-id supply across every mint/burn/transfer so
    /// destroyEdition can prove a caller owns the whole edition.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal override
    {
        super._update(from, to, ids, values);
        for (uint256 i = 0; i < ids.length; i++) {
            if (from == address(0)) supplyOf[ids[i]] += values[i];   // mint
            if (to == address(0))   supplyOf[ids[i]] -= values[i];   // burn
        }
    }

    // ─── burn: pull it, destroy it ───
    function _burnToll(address payer, uint256 amount) internal {
        require(token.transferFrom(payer, address(this), amount), "toll");
        token.burn(amount);
    }

    // ─── creator cut: pull it, pay the artist (constructive acts only) ───
    function _toCreator(address payer, uint256 id, uint256 amount, bytes32 kind) internal {
        require(token.transferFrom(payer, creator, amount), "toll");
        emit CreatorPaid(payer, id, amount, kind);
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
    function setTolls(uint256 s, uint256 t, uint256 w, uint256 m) external onlyCurator {
        sendToll = s; tradeToll = t; wagerToll = w; marqueeToll = m;
    }

    /// @notice Open a season: set the live season, its pack allotment (via the
    /// card-copy budget), and the season's pack price line, resetting cardsIssued so
    /// the new, smaller allotment starts fresh. By design the budget dwindles and
    /// the floor rises each season — see the schedule in docs/TOKEN-MATH.md. Pass
    /// cardBudget = 0 to leave the allotment uncapped (early testnet).
    function openSeason(uint32 s, uint256 cardBudget, uint256 base, uint256 ceil)
        external onlyCurator
    {
        require(ceil >= base, "ceil<base");
        currentSeason = s;
        seasonCardBudget = cardBudget;
        cardsIssued = 0;
        packBase = base;
        packCeil = ceil;
    }

    /// @notice Fine-tune the pack price line mid-season (recalibrate the $7-and-up
    /// USD target against the live token price without rolling the season).
    function setPackPrice(uint256 base, uint256 ceil) external onlyCurator {
        require(ceil >= base, "ceil<base");
        packBase = base; packCeil = ceil;
    }
    function setCreator(address c) external onlyCurator { creator = c; }
    function setRetireQuorum(uint32 q) external onlyCurator { retireQuorum = q; }
    function setDestroyToll(uint256 d) external onlyCurator { destroyToll = d; }
    function setReward(uint256 r, uint256 cut) external onlyCurator { lastStandingReward = r; rewardCut = cut; }

    /// @notice Top up the house reward pool for last-standers (anyone can seed it).
    function fundReward(uint256 amount) external {
        require(token.transferFrom(msg.sender, address(this), amount), "fund");
        rewardPool += amount;
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

    /// @notice Vote a card up (promote) or down (demote). Votes settle
    /// immediately: cross the bar and the card moves that block. UP is a
    /// constructive act — the amount PAYS THE CREATOR (at prizm it becomes a
    /// HODL vote, still to the creator). DOWN is destructive — the amount BURNS,
    /// and it must clear the card's HODL buffer before touching net. Retiring a
    /// card off the island additionally needs a quorum of distinct downvoters.
    function voteRarity(uint256 id, bool up, uint256 amount) external {
        if (id == MARQUEE_ID) revert MarqueeNotPlayable();
        if (!cardInfo[id].exists) revert UnknownCard();
        if (amount == 0) revert ZeroAmount();
        if (up) {
            // championing art pays the artist
            if (cardInfo[id].tier == Tier.Prizm && !retired[id]) {
                _toCreator(msg.sender, id, amount, "hodl");   // nowhere to climb → anchor
                hodlBuffer[id] += amount;
                emit HodlVote(id, msg.sender, amount);
                return;
            }
            _toCreator(msg.sender, id, amount, "upvote");
            rarityNet[id] += int256(amount);
            emit RarityVote(id, msg.sender, true, amount);
            _settleRarity(id);
        } else {
            // scorn feeds the fire, and is counted as a distinct verdict
            _burnToll(msg.sender, amount);
            _recordDownvoter(id, msg.sender);
            uint256 buf = hodlBuffer[id];
            if (buf >= amount) {
                hodlBuffer[id] = buf - amount;      // fully absorbed by the anchor
                emit RarityVote(id, msg.sender, false, amount);
                return;
            }
            if (buf > 0) { hodlBuffer[id] = 0; amount -= buf; }
            rarityNet[id] -= int256(amount);
            emit RarityVote(id, msg.sender, false, amount);
            _settleRarity(id);
        }
    }

    function _recordDownvoter(uint256 id, address who) internal {
        if (!didDownvote[id][who]) { didDownvote[id][who] = true; downvoterCount[id]++; }
    }

    /// @notice ⛨ HODL: anchor a card where it is. Adds to its buffer — future
    /// demotes burn through the buffer before they can move the card. Works at
    /// any tier, so curators can shield the packs they believe in. HODL is
    /// constructive conviction, so the amount pays the creator.
    function voteHodl(uint256 id, uint256 amount) external {
        if (id == MARQUEE_ID) revert MarqueeNotPlayable();
        if (!cardInfo[id].exists) revert UnknownCard();
        if (amount == 0) revert ZeroAmount();
        _toCreator(msg.sender, id, amount, "hodl");
        hodlBuffer[id] += amount;
        emit HodlVote(id, msg.sender, amount);
    }

    // ─── corner the edition: own it all, and you may end it ───

    /// @notice Deliver the killing blow to a card the community has ALREADY voted
    /// off the island. This is how the field is culled toward the 77-card standard
    /// deck: the crowd downvotes a card until it retires (needs the quorum), its
    /// copies dwindle, and whoever corners the last of them ends it here. Two gates,
    /// deliberately: the card must be `retired` (a community verdict, not one
    /// whale's whim) AND you must hold every circulating copy. Then all copies burn,
    /// a destroyToll burns on top, and the keeper is minted an **Ash Trophy** + paid
    /// the last-standing bounty. A healthy, un-retired card cannot be destroyed — no
    /// bounty-farming a beloved edition. The 1/1 marquee is indestructible.
    function destroyEdition(uint256 id) external returns (uint256 trophyId) {
        if (id == MARQUEE_ID) revert MarqueeNotPlayable();
        if (!cardInfo[id].exists) revert UnknownCard();
        if (!retired[id]) revert NotRetired();  // the court must condemn it first
        uint256 sup = supplyOf[id];
        if (sup == 0) revert UnknownCard();
        if (balanceOf(msg.sender, id) != sup) revert NotWholeEdition();  // must corner it all
        _burnToll(msg.sender, destroyToll);
        _burn(msg.sender, id, sup);          // every copy to ash (supplyOf → 0 via _update)
        cardInfo[id].exists = false;
        retired[id] = true;
        // reward the last keeper: an Ash Trophy card + a $UR3030 payout from the house
        trophyId = ++nextTrophy;
        trophyForEdition[id] = trophyId;
        trophyEdition[trophyId] = id;
        isAshTrophy[trophyId] = true;
        _mint(msg.sender, trophyId, 1, "");
        uint256 payout = rewardPool < lastStandingReward ? rewardPool : lastStandingReward;
        if (payout > 0) { rewardPool -= payout; require(token.transfer(msg.sender, payout), "reward"); }
        emit AshTrophy(id, msg.sender, trophyId, payout);
        emit EditionDestroyed(id, msg.sender, sup, destroyToll);
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
        // fall while scorn clears each bar. Tiers slide on conviction alone, but
        // the final step OFF the island (retire) also needs a crowd: at least
        // `retireQuorum` distinct wallets must have downvoted. Short of quorum the
        // card sits at Common with its scorn banked, and retires the moment the
        // quorum-completing vote lands.
        while (!retired[id] && net <= -int256(stepCost(info.tier))) {
            if (info.tier == Tier.Common) {
                if (downvoterCount[id] >= retireQuorum) {
                    net += int256(stepCost(Tier.Common));
                    retired[id] = true;
                    emit CardRetired(id);
                }
                break;                       // at the floor: retired, or waiting on quorum
            }
            net += int256(stepCost(info.tier));
            info.tier = Tier(uint8(info.tier) - 1);
            emit RarityShifted(id, info.tier);
        }
        rarityNet[id] = net;
    }

    // ─── rip a pack: burn the price, pull 7 by rarity weight ───
    // weights mirror the site's pack.js: common 48 / uncommon 30 / rare 15 / mythic 6 / prizm 1

    /// @notice Live pack price: a straight line from packBase (fresh allotment) to
    /// packCeil (allotment exhausted), indexed by the fraction of the season's card
    /// budget already ripped. Constant at packBase when the budget is uncapped.
    function packPrice() public view returns (uint256) {
        uint256 budget = seasonCardBudget;
        if (budget == 0 || packCeil <= packBase) return packBase;
        uint256 issued = cardsIssued;
        if (issued >= budget) return packCeil;                 // allotment spent → the ceiling
        return packBase + (packCeil - packBase) * issued / budget;
    }

    /// @notice Packs remaining in this season's allotment (uint max when uncapped).
    function packsLeft() external view returns (uint256) {
        if (seasonCardBudget == 0) return type(uint256).max;
        if (cardsIssued >= seasonCardBudget) return 0;
        return (seasonCardBudget - cardsIssued) / CARDS_PER_PACK;
    }

    function ripPack() external returns (uint256[] memory ids) {
        // packs are the season's dwindling allotment: 7 copies a rip, capped by the
        // card-copy budget. Price rises as that budget is spent (packPrice()). A
        // sliver of the price seeds the house bounty that pays whoever later culls a
        // card back down; the rest burns. When the allotment is gone, packs close
        // for the season — the only cards left come off the secondary market.
        if (seasonCardBudget != 0 && cardsIssued + CARDS_PER_PACK > seasonCardBudget)
            revert AllotmentSpent();
        uint256 price = packPrice();
        uint256 cut = rewardCut < price ? rewardCut : 0;
        if (cut > 0) { require(token.transferFrom(msg.sender, address(this), cut), "toll"); rewardPool += cut; }
        _burnToll(msg.sender, price - cut);
        cardsIssued += CARDS_PER_PACK;
        ids = new uint256[](CARDS_PER_PACK);
        bytes32 seed = keccak256(abi.encodePacked(blockhash(block.number - 1), msg.sender, _nonce++));
        for (uint256 i = 0; i < CARDS_PER_PACK; i++) {
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
        emit PackRipped(msg.sender, ids, price);
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

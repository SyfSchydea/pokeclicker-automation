// ==UserScript==
// @name         Pokéclicker - Auto Digger
// @namespace    http://tampermonkey.net/
// @version      1.8.2
// @description  Automates digging underground in Pokéclicker.
// @author       SyfP
// @match        https://www.pokeclicker.com/
// @grant        none
// ==/UserScript==

/* global App, Mine, MineItemsQuest, MineLayersQuest, Underground */

(() => {
	"use strict";

	/**
	 * Generate up to 4 positions surrounding the given tile.
	 *
	 * @param pos  {{x: number, y: number}} - Center position.
	 * @param size {{x: number, y: number}} - Width and Height of the grid.
	 */
	function* surroundingTiles(pos, size) {
		if (pos.y > 0) {
			yield {x: pos.x, y: pos.y - 1};
		}

		if (pos.x > 0) {
			yield {x: pos.x - 1, y: pos.y};
		}

		if (pos.y < size.y - 1) {
			yield {x: pos.x, y: pos.y + 1};
		}

		if (pos.x < size.x - 1) {
			yield {x: pos.x + 1, y: pos.y};
		}
	}

	///// Page Interface /////

	/*
	 * This section should contain functions which
	 * provide an interface to the target page.
	 *
	 * The intended behaviour of these functions should be
	 * clearly defined in comments, to make them easier to update
	 * and maintain if and when the target page changes, as the
	 * interface may not function correctly after any change.
	 */

	const page = {
		CHISEL_LAYERS: 2,

		/**
		 * Check if the game has been loaded.
		 *
		 * @return - Truthy if the game has loaded, falsey otherwise.
		 */
		gameLoaded() {
			return App && App.game;
		},

		/**
		 * Check if the player can access the underground minigame.
		 *
		 * @return - Truthy if the player is able to play the underground. Falsey if not.
		 */
		canAccess() {
			return App.game.underground.canAccess();
		},

		/**
		 * Generator for each tile in the grid.
		 *
		 * @yields {[object|0, number, number]} - Array of tile object, x, y for each.
		 */
		_tilesInGrid: function*() {
			for (let y = 0; y < Mine.rewardGrid.length; ++y) {
				const row = Mine.rewardGrid[y];

				for (let x = 0; x < row.length; ++x) {
					yield [row[x], x, y];
				}
			}
		},

		/**
		 * Check if the player has found (but not necessarily
		 * fully excavated) all available reward items.
		 *
		 * @return - Truthy if the player located all rewards, falsey otherwise.
		 */
		hasLocatedAllRewards() {
			const unfoundRewards = Array.from(Mine.rewardNumbers);

			for (let [item, x, y] of this._tilesInGrid()) {
				if (!item || !item.revealed) {
					continue;
				}

				const idx = unfoundRewards.indexOf(item.value);
				if (idx < 0) {
					continue;
				}

				unfoundRewards.splice(idx, 1);

				if (unfoundRewards.length == 0) {
					return true;
				}
			}

			return unfoundRewards.length == 0;
		},

		/**
		 * Locate a tile from an item which has been located but not excavated.
		 *
		 * @return {{x: number, y: number}|null} - X/Y coordinate object
		 */
		findUnexcavatedItem() {
			let excavatedItems = [];

			for (let [item, x, y] of this._tilesInGrid()) {
				if (!item || !item.revealed) {
					continue;
				}

				if (excavatedItems.includes(item.value)) {
					continue;
				}

				if (Mine.checkItemRevealed(item.value)) {
					excavatedItems.push(item.value);
					continue;
				}

				return {x, y};
			}

			return null;
		},

		/**
		 * Check if the current layer has been completed.
		 * This should return truthy for a short period of time between
		 * finishing one layer and the next layer being generated.
		 *
		 * @return - Truthy if the layer has been completed. Falsey otherwise.
		 */
		isLayerCompleted() {
			return Mine.loadingNewLayer;
		},

		/**
		 * Fetch the amount of energy the player currently has available.
		 *
		 * @return {number} - Amounnt of energy.
		 */
		getEnergy() {
			return App.game.underground.energy;
		},

		/**
		 * Fetch the player's current energy cap.
		 *
		 * @return {number} - Max energy value.
		 */
		getMaxEnergy() {
			return App.game.underground.getMaxEnergy();
		},

		/**
		 * Find out how many energy points the player will gain
		 * each time it is restored passively.
		 *
		 * @return {number} - Energy restored amount
		 */
		getEnergyRestoredAmount() {
			return App.game.underground.getEnergyGain();
		},

		/**
		 * Check if the player can afford a bomb use.
		 *
		 * @return - Truthy if the player can afford a bomb, falsey otherwise.
		 */
		canAffordBomb() {
			return App.game.underground.energy >= Underground.BOMB_ENERGY;
		},

		/**
		 * Attempt to use a bomb.
		 */
		useBomb() {
			Mine.bomb();
		},

		/**
		 * Check if the player can afford a chisel use.
		 *
		 * @return - Truthy if the player can afford a chisel, falsey otherwise.
		 */
		canAffordChisel() {
			return App.game.underground.energy >= Underground.CHISEL_ENERGY;
		},

		/**
		 * Attempt to use the chisel.
		 *
		 * @param pos {{x: number, y: number}} - Position to use chisel;
		 */
		useChisel(pos) {
			Mine.chisel(pos.y, pos.x);
		},

		/**
		 * Check if the player can currently afford a survey.
		 *
		 * @return - Truthy if the player has enough energy for a survey, or falsey if not.
		 */
		canAffordSurvey() {
			const underground = App.game.underground;
			return underground.energy >= underground.getSurvey_Cost();
		},

		/**
		 * Test if the player has used a survey on the current floor.
		 *
		 * @return - Truthy if the player has used a survey, falsey otherwise.
		 */
		hasUsedSurvey() {
			return !!Mine.surveyResult();
		},

		/**
		 * Return the quantities/values of the items on the current floor, as returned by a survey.
		 *
		 * @return {Object} - Object containing 'fossils', 'fossilpieces', 'plates', 'evoItems',
		 *                    'totalValue', 'shards', and 'megaStones', similar to how
		 *                    Mine.rewardSummary returns it.
		 *                    Null if the player has not yet used a survey on this floor.
		 */
		getSurveyResult() {
			if (!this.hasUsedSurvey()) {
				return null;
			}

			return Mine.rewardSummary();
		},

		/**
		 * Attempt to use a survey.
		 */
		useSurvey() {
			Mine.survey();
			$("#mine-survey-result").trigger("mouseout");
		},

		/**
		 * Test if the player can afford to skip the current floor.
		 *
		 * @return - Truthy if the player can afford to use a skip. False if not.
		 */
		canAffordSkip() {
			return Mine.skipsRemaining() > 0;
		},

		/**
		 * Attempt to skip the current layer.
		 */
		skipLayer() {
			Mine.skipLayer(/*shouldConfirm*/ false);
		},

		/**
		 * Fetch the size of the current mine grid.
		 *
		 * @return {{x: number, y: number}} - Grid width and height.
		 */
		getMineGridSize() {
			return {
				y: Mine.rewardGrid.length,
				x: Mine.rewardGrid[0].length,
			};
		},

		/**
		 * Find the number of layers remaining at the specified position.
		 *
		 * @param pos {{x: number, y: number}} - Tile position to check.
		 * @return    {number}                 - Number of layers left on the tile.
		 */
		getTileLayers(pos) {
			return Mine.grid[pos.y][pos.x]();
		},

		/**
		 * Check if the given tile has been fully revealed.
		 *
		 * @param pos {{x: number, y: number}} - Tile position to check.
		 * @return                             - Truthy if the tile has been revealed. Falsey otherwise.
		 */
		tileRevealed(pos) {
			return this.getTileLayers(pos) <= 0;
		},

		/**
		 * Check if the given tile has an unexcavated item under it.
		 * To avoid cheating (too much), an item should only be reported if its
		 * tile, or one of the four neighbouring tiles have been fully revealed.
		 * If the tiles are not revealed, then the function should return falsey,
		 * even if there really is an item under it.
		 *
		 * @param pos {{x: number, y: number}} - Tile position to check.
		 * @return                             - Truthy if the tile has an unexcavated item. Falsey otherwise.
		 */
		tileHasUnclaimedItem(pos) {
			const item = Mine.rewardGrid[pos.y][pos.x];
			if (!item) {
				return false;
			}

			// Only return information about the tile if it is revealed,
			// or a neighbouring tile from the same item is revealed.
			let revealTile = item.revealed;
			if (!revealTile) {
				for (const spos of surroundingTiles(pos, this.getMineGridSize())) {
					const nearbyItem = Mine.rewardGrid[spos.y][spos.x];
					if (nearbyItem && nearbyItem.revealed && nearbyItem.value == item.value) {
						revealTile = true;
						break;
					}
				}
			}

			if (!revealTile) {
				return false;
			}

			return !Mine.checkItemRevealed(item.value);
		},

		/**
		 * Fetch the total number of layers mined by the player.
		 *
		 * @return {number} - Number of layers mined.
		 */
		getTotalLayersMined() {
			return App.game.statistics.undergroundLayersMined();
		},

		/**
		 * Checks if the player currently has an underground task.
		 * This includes both the item quests and the layer quests.
		 *
		 * @return - Truthy if the player has an underground related quest. Falsey otherwise.
		 */
		hasUndergroundQuest() {
			return App.game.quests.currentQuests()
				.some(q => (q instanceof MineItemsQuest || q instanceof MineLayersQuest)
					&& !q.isCompleted());
		},

		/**
		 * Find the player's diamond net worth.
		 * This is the number of diamonds the player would have if they sold every item worth any diamonds.
		 *
		 * @return {number} - Diamond net worth.
		 */
		getDiamondNetWorth() {
			return Underground.getDiamondNetWorth();
		},

		/**
		 * Get the number of actual diamonds the player actually owns.
		 *
		 * @return {number} - Number of diamonds.
		 */
		getDiamonds() {
			return App.game.wallet.currencies[GameConstants.Currency.diamond]();
		},

		/**
		 * Get a list of all underground items.
		 *
		 * @return {string[]} - Array of item names.
		 */
		getAllItems() {
			return UndergroundItems.list.map(x => x.name);
		},

		/**
		 * Get the diamond value of the given item.
		 * 0 if the item does not cost diamonds.
		 *
		 * @param itemName {string} - Name of the item to query.
		 * @return         {number} - Diamond value of the item.
		 */
		getItemDiamondValue(itemName) {
			const item = UndergroundItems.getByName(itemName);
			if (!item) {
				throw new Error(`Item '${itemName}' not found`);
			}

			if (item.valueType != UndergroundItemValueType.Diamond) {
				return 0;
			}

			return item.value;
		},

		/**
		 * Get the number of the given item the player owns.
		 *
		 * @param itemName {string} - Named of the item to query.
		 * @return         {number} - Number of the item owned.
		 */
		getItemCount(itemName) {
			const itemStrId = UndergroundItems.getByName(itemName).itemName;
			return player.itemList[itemStrId]();
		},

		/**
		 * Check if an item has been locked for selling.
		 *
		 * @param itemName {string} - Named of the item to query.
		 * @return                  - Truthy if locked, falsey if not.
		 */
		itemIsLocked(itemName) {
			const item = UndergroundItems.getByName(itemName);
			return item.sellLocked();
		},

		/**
		 * Sell one of the given item.
		 *
		 * @param itemName {string} - Named of the item to sell.
		 */
		sellItem(itemName) {
			const item = UndergroundItems.getByName(itemName);
			if (!item) {
				throw new Error(`Item '${itemName}' not found`);
			}

			Underground.sellMineItem(item, 1);
		},
	};

	//////////////////////////

	/*
	 * The main functionality of the script should go here.
	 *
	 * Any interaction with the page should only be done
	 * through the page interface defined above.
	 */

	const WINDOW_KEY = "diggy";

	const DELAY_BOMB      =      1000;
	const DELAY_CHISEL    =       200;
	const DELAY_SURVEY    =      1000;
	const DELAY_SELL      =      1000;
	const DELAY_IDLE      = 20 * 1000;
	const DELAY_NEW_LAYER =  5 * 1000;
	const DELAY_INIT      =      1000;
	const DELAY_NO_TASK   = 60 * 1000;

	const TARGET_DIAMOND_VALUE = 5000;
	const MAX_DIAMOND_VALUE    = TARGET_DIAMOND_VALUE + 1000;

	/**
	 * Compare two {x, y} position objects.
	 */
	function posEqual(posA, posB) {
		return posA.x == posB.x && posA.y == posB.y;
	}

	/**
	 * Find spot to attempt to unearth a partially exposed item.
	 *
	 * @return {{x: number, y: number}} - Location to chisel.
	 */
	function findChiselSpotExcavate() {
		const startingTile = page.findUnexcavatedItem();
		if (!startingTile) {
			throw new Error("Failed to find starting point");
		}

		const tiles = [startingTile];
		const expanded = [];
		const gridSize = page.getMineGridSize();
		while (tiles.length > 0) {
			const tile = tiles.pop();

			if (expanded.some(t => posEqual(t, tile))) {
				continue;
			}

			expanded.push(tile);

			if (!page.tileHasUnclaimedItem(tile)) {
				continue;
			}

			if (!page.tileRevealed(tile)) {
				return tile;
			}

			for (const newTile of surroundingTiles(tile, gridSize)) {
				tiles.push(newTile);
			}
		}

		throw new Error("Failed to find chisel tile");
	}

	// Find a spot to use the chisel while searching for unfound items.
	function findChiselSpotSearch() {
		// Go through list of all tiles to find all fully excavated tiles.
		const gridSize = page.getMineGridSize();
		const activeTiles = [];
		for (let y = 0; y < gridSize.y; y++) {
			for (let x = 0; x < gridSize.x; x++) {
				if (page.tileRevealed({x, y})) {
					activeTiles.push({x, y, distance: 0});
				}
			}
		}

		// Breadth first search to find tiles furthest from
		// the nearest excavated tile, manhattan distance.
		const expanded = new Set();
		let maxDistance = 0;
		let minChisels = Infinity;
		let furthestTiles = [];
		while (activeTiles.length > 0) {
			const thisTile = activeTiles.shift();
			const thisKey = expandedListKey(thisTile);

			if (expanded.has(thisKey)) {
				continue;
			}

			for (const newTile of surroundingTiles(thisTile, gridSize)) {
				activeTiles.push({
					x: newTile.x,
					y: newTile.y,
					distance: thisTile.distance + 1,
				});
			}

			expanded.add(thisKey);

			if (thisTile.distance < maxDistance) {
				continue;
			}

			const thisTileChisels = Math.ceil(page.getTileLayers(thisTile) / page.CHISEL_LAYERS);

			if (thisTile.distance > maxDistance) {
				maxDistance = thisTile.distance;
				minChisels = thisTileChisels;
				furthestTiles = [thisTile];
				continue;
			}

			if (thisTileChisels > minChisels) {
				continue;
			}

			if (thisTileChisels < minChisels) {
				maxDistance = thisTile.distance;
				minChisels = thisTileChisels;
				furthestTiles = [thisTile];
				continue;
			}

			furthestTiles.push(thisTile);
		}

		const chosenTile = furthestTiles[0];
		return {
			x: chosenTile.x,
			y: chosenTile.y,
		};

		function expandedListKey(pos) {
			return pos.x + "," + pos.y;
		}
	}

	/**
	 * Check if the current floor should be skipped.
	 *
	 * @return {boolean} - True if the floor should be skipped, false if not, or if we don't have enough information.
	 */
	function shouldSkipFloor() {
		const survey = page.getSurveyResult();
		if (!survey) {
			return false;
		}

		// If the floor contains only gem plates and shards, skip it.
		return (survey.fossils <= 0 && survey.fossilpieces <= 0
				&& survey.evoItems <=0 && survey.totalValue <= 0
				&& survey.megaStones <= 0);
	}

	/**
	 * Attempt to sell an item for diamonds.
	 * Return true if an item was sold.
	 */
	function sellItem() {
		const item = getMostOwnedItem();
		if (!item) {
			return false;
		}

		page.sellItem(item);
		return true;
	}

	/**
	 * Get the diamond value item which the player owns the most of.
	 */
	function getMostOwnedItem() {
		let mostOwnedItem = null;
		let amount = 0;

		for (const item of page.getAllItems()) {
			if (page.getItemDiamondValue(item) <= 0
					|| page.itemIsLocked(item)) {
				continue;
			}

			const itemAmt = page.getItemCount(item);
			if (itemAmt > amount) {
				mostOwnedItem = item;
				amount = itemAmt;
			}
		}

		return mostOwnedItem;
	}

	/**
	 * Task for locating, but not necessarily fully excavating all rewards on the current layer.
	 */
	class LocateTask {
		/**
		 * Check if the task has completed or expired.
		 */
		hasExpired() {
			return page.hasLocatedAllRewards();
		}

		action() {
			if (page.canAffordBomb()) {
				page.useBomb();
				return DELAY_BOMB;
			}

			return DELAY_IDLE;
		}
	}

	/**
	 * Task for completing a single layer.
	 */
	class LayerTask {
		constructor() {
			// Task expires after this many layers total have been mined.
			this.expirationLayers = page.getTotalLayersMined() + 1;
		}

		hasExpired() {
			const currentLayers = page.getTotalLayersMined();
			return currentLayers >= this.expirationLayers;
		}

		action() {
			if (page.isLayerCompleted()) {
				return DELAY_NEW_LAYER;
			}

			const energyThreshold = page.getMaxEnergy() - page.getEnergyRestoredAmount();
			if (page.getEnergy() < energyThreshold) {
				return DELAY_IDLE;
			}

			if (page.hasLocatedAllRewards()) {
				if (page.canAffordChisel()) {
					page.useChisel(findChiselSpotExcavate());
					return DELAY_CHISEL;
				}

				return DELAY_IDLE;

			}

			if(shouldSkipFloor() && page.canAffordSkip()) {
				page.skipLayer();
				return DELAY_NEW_LAYER
			}

			if (!page.hasUsedSurvey()) {
				if (!page.canAffordSurvey()) {
					return DELAY_IDLE;
				}

				page.useSurvey();
				return DELAY_SURVEY;
			}

			if (page.canAffordChisel()) {
				page.useChisel(findChiselSpotSearch());
				return DELAY_CHISEL;
			}

			return DELAY_IDLE;
		}
	}

	/**
	 * Handles completing either "Mine N items" or "Mine N layers" tasks.
	 */
	class QuestTask extends LayerTask {
		hasExpired() {
			return !page.hasUndergroundQuest();
		}
	}

	/**
	 * Mines up to a specified diamond value while idle.
	 */
	class NetWorthTask extends LayerTask {
		hasExpired() {
			return page.getDiamonds() >= MAX_DIAMOND_VALUE;
		}

		action() {
			const delay = super.action();
			if (delay != DELAY_IDLE) {
				return delay;
			}

			if (page.getDiamonds() < page.getDiamondNetWorth() * 0.5
					&& sellItem()) {
				return DELAY_SELL;
			}

			return DELAY_IDLE;
		}
	}

	let currentTask = null;
	let tickTimeoutId = null;

	function scheduleTick(delay) {
		if (tickTimeoutId != null) {
			clearTimeout(tickTimeoutId);
		}

		tickTimeoutId = setTimeout(tick, delay);
	}

	function tick() {
		tickTimeoutId = null;

		if (!page.gameLoaded() || !page.canAccess()) {
			return scheduleTick(DELAY_INIT);
		}

		if (!currentTask) {
			if (page.hasUndergroundQuest()) {
				console.log("Mining for a quest");
				currentTask = new QuestTask();
			} else if (page.getDiamonds() < TARGET_DIAMOND_VALUE) {
				console.log("Mining for diamonds");
				currentTask = new NetWorthTask();
			} else {
				return scheduleTick(DELAY_NO_TASK);
			}
		}

		if (currentTask.hasExpired()) {
			console.log("Diggy task expired");
			currentTask = null;
			return scheduleTick(DELAY_NO_TASK);
		}

		const nextDelay = currentTask.action() || DELAY_IDLE;
		scheduleTick(nextDelay);
	}

	function cmdLocate() {
		currentTask = new LocateTask();
		scheduleTick(DELAY_INIT);
	}

	function cmdLayer() {
		currentTask = new LayerTask();
		scheduleTick(DELAY_INIT);
	}

	(function main() {
		window[WINDOW_KEY] = {
			locate: cmdLocate,
			layer:  cmdLayer,
		};

		if (!window.syfScripts) {
			window.syfScripts = {};
		}

		window.syfScripts.diggy = {
			canCompleteItemsQuest() { return true; },
			canCompleteLayersQuest() { return true; },
		};

		scheduleTick(DELAY_INIT);
	})();
})();

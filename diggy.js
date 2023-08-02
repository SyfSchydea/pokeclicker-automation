// ==UserScript==
// @name         Pokéclicker - Auto Digger
// @namespace    http://tampermonkey.net/
// @version      1.4
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
		/**
		 * Check if the game has been loaded.
		 *
		 * @return - Truthy if the game has loaded, falsey otherwise.
		 */
		gameLoaded() {
			return App && App.game;
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
		 * Attempt to use a survey.
		 */
		useSurvey() {
			Mine.survey();
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
		 * Check if the given tile has been fully revealed.
		 *
		 * @param pos {{x: number, y: number}} - Tile position to check.
		 * @return                             - Truthy if the tile has been revealed. Falsey otherwise.
		 */
		tileRevealed(pos) {
			return Mine.grid[pos.y][pos.x]() <= 0;
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
	};

	//////////////////////////

	/*
	 * The main functionality of the script should go here.
	 *
	 * Any interaction with the page should only be done
	 * through the page interface defined above.
	 */

	const WINDOW_KEY = "diggy";

	const DELAY_BOMB      =           1000;
	const DELAY_CHISEL    =            200;
	const DELAY_SURVEY    =           1000;
	const DELAY_IDLE      = 10 * 60 * 1000;
	const DELAY_NEW_LAYER =       5 * 1000;
	const DELAY_INIT      =           1000;
	const DELAY_NO_TASK   =      60 * 1000;

	const TARGET_DIAMOND_VALUE = 1000;

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
	function findChiselSpot() {
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

			if (!page.hasLocatedAllRewards()) {
				if (!page.hasUsedSurvey()) {
					if (!page.canAffordSurvey()) {
						return DELAY_IDLE;
					}

					page.useSurvey();
					return DELAY_SURVEY;
				}

				if (page.canAffordBomb()) {
					page.useBomb();
					return DELAY_BOMB;
				}

				return DELAY_IDLE;
			}

			if (page.canAffordChisel()) {
				page.useChisel(findChiselSpot());
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
			return page.getDiamondNetWorth() >= TARGET_DIAMOND_VALUE;
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

		if (!page.gameLoaded()) {
			return scheduleTick(DELAY_INIT);
		}

		if (!currentTask) {
			if (page.hasUndergroundQuest()) {
				console.log("Mining for a quest");
				currentTask = new QuestTask();
			} else if (page.getDiamondNetWorth() < TARGET_DIAMOND_VALUE) {
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

		scheduleTick(DELAY_INIT);
	})();
})();

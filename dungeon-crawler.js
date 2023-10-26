// ==UserScript==
// @name         Pokéclicker - Auto Dungeon Crawler
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Completes dungeons automatically.
// @author       SyfP
// @match        https://www.pokeclicker.com/
// @grant        none
// ==/UserScript==

/* global GameConstants, App, DungeonRunner */

(() => {
	"use strict";

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
		 * Not required by interfaces.
		 * Fetch the dungeon which the player is currently at.
		 *
		 * @return {Dungeon} - Dungeon object.
		 */
		_getPlayerDungeon() {
			const town = player.town();
			if (!(town instanceof DungeonTown)) {
				throw new Error("Not at a dungeon");
			}

			const dungeon = town.dungeon;
			if (!dungeon) {
				throw new Error("Failed to find dungeon");
			}

			return dungeon;
		},

		/**
		 * Attempt to enter the currently selected dungeon.
		 */
		enterDungeon() {
			const dungeon = this._getPlayerDungeon();
			const cost = new Amount(dungeon.tokenCost, GameConstants.Currency.dungeonToken);
			if (!App.game.wallet.hasAmount(cost)) {
				throw new Error("Can't afford the dungeon");
			}

			DungeonRunner.initializeDungeon(dungeon);
		},

		/**
		 * Attempt to move to the specified position in the dungeon.
		 *
		 * @param x {number} - X coordinate to move to.
		 * @param y {number} - Y coordinate to move to.
		 */
		moveToTile(x, y) {
			const point = {floor: this._getFloorId(), x, y};

			if (!DungeonRunner.map.hasAccessToTile(point)) {
				throw new Error("Can't move to that tile at the moment");
			}

			DungeonRunner.map.moveToCoordinates(x, y);
		},

		/**
		 * Open a treasure chest or start a boss fight.
		 * Does nothing on other types of tiles.
		 */
		activateTile() {
			switch (DungeonRunner.currentTileType()()) {
				case GameConstants.DungeonTile.chest:
					DungeonRunner.openChest();
					break;

				case GameConstants.DungeonTile.boss:
					DungeonRunner.startBossFight();
					break;
			}
		},

		/**
		 * Check if a dungeon is currently active.
		 *
		 * @return - Truthy if a dungeon is active. Falsey otherwise.
		 */
		dungeonActive() {
			return App.game.gameState === GameConstants.GameState.dungeon;
		},

		/**
		 * Check if the player is busy in the dungeon.
		 * While fighting or catching, the player cannot perform any other actions.
		 *
		 * @return - Truthy if the player is busy. Falsey otherwise.
		 */
		dungeonBusy() {
			return DungeonRunner.fighting() || DungeonBattle.catching();
		},

		/**
		 * Get current floor id.
		 *
		 * @return {number} - Index of the current floor.
		 */
		_getFloorId(){
			return DungeonRunner.map.playerPosition().floor;
		},

		/**
		 * Find the size of the current dungeon grid.
		 *
		 * @return {number} - Width/height of the current dungeon.
		 */
		getGridSize() {
			return DungeonRunner.map.floorSizes[this._getFloorId()];
		},

		/**
		 * Fetch the given tile in the dungeon.
		 *
		 * @param x {number} - X coordinate to fetch.
		 * @param y {number} - Y coordinate to fetch.
		 * @return           - Tile object.
		 */
		_getTile(x, y) {
			return DungeonRunner.map.board()[this._getFloorId()][y][x];
		},

		/**
		 * Check if the given location is known to have the boss.
		 *
		 * @param x {number} - X coordinate to check.
		 * @param y {number} - Y coordinate to check.
		 * @return           - Truthy if the tile has the boss. Falsey otherwise.
		 */
		tileIsBoss(x, y) {
			const tile = this._getTile(x, y);
			return tile.isVisible && tile.type() == GameConstants.DungeonTile.boss;
		},

		/**
		 * Check if the given location is known to have an enemy.
		 *
		 * @param x {number} - X coordinate to check.
		 * @param y {number} - Y coordinate to check.
		 * @return           - Truthy if the tile has an enemy. Falsey otherwise.
		 */
		tileIsEnemy(x, y) {
			const tile = this._getTile(x, y);
			return tile.isVisible && tile.type() == GameConstants.DungeonTile.enemy;
		},

		/**
		 * Check if the given location is known to have an chest.
		 *
		 * @param x {number} - X coordinate to check.
		 * @param y {number} - Y coordinate to check.
		 * @return           - Truthy if the tile has a chest. Falsey otherwise.
		 */
		tileIsChest(x, y) {
			const tile = this._getTile(x, y);
			return tile.isVisible && tile.type() == GameConstants.DungeonTile.chest;
		},

		/**
		 * Check if the given location is an unknown tile.
		 *
		 * @param x {number} - X coordinate to check.
		 * @param y {number} - Y coordinate to check.
		 * @return           - Truthy if the tile is unknown or falsey if it is known.
		 */
		tileIsUnknown(x, y) {
			return !this._getTile(x, y).isVisible;
		},

		/**
		 * Check if the given location has been explored by the player.
		 *
		 * @param x {number} - X coordinate to check.
		 * @param y {number} - Y coordinate to check.
		 * @return           - Truthy if the player has visited the tile. Falsey otherwise.
		 */
		tileIsVisited(x, y) {
			return this._getTile(x, y).isVisited;
		},

		/**
		 * Look up how many times the player has cleared the given dungeon.
		 *
		 * @param name {string} - Name of the dungeon to query.
		 * @return     {number} - Number of times the player has cleared the dungeon.
		 */
		getDungeonClears(name) {
			const dungIdx = GameConstants.getDungeonIndex(name);
			return App.game.statistics.dungeonsCleared[dungIdx]();
		},

		/**
		 * Find the name of the dungeon the player is currently at.
		 *
		 * @return {string} - Name of the dungeon.
		 */
		getCurrentDungeonName() {
			return this._getPlayerDungeon().name;
		},

		/**
		 * Check if the player has flash for the current dungeon.
		 *
		 * @return - Truthy if the player has flash or falsey otherwise.
		 */
		hasFlash() {
			return DungeonRunner.map.flash;
		},

		/**
		 * Check if there are any hidden chests left on the map.
		 *
		 * @return - Truthy if there are one or more undiscovered
		 *           chests left on the map. Falsey otherwise.
		 */
		hasHiddenChests() {
			for (const row of DungeonRunner.map.board()[this._getFloorId()]) {
				for (const tile of row) {
					if (!tile.isVisible
							&& tile.type() == GameConstants.DungeonTile.chest) {
						return true;
					}
				}
			}

			return false;
		},
	};

	//////////////////////////

	/*
	 * The main functionality of the script should go here.
	 *
	 * Any interaction with the page should only be done
	 * through the page interface defined above.
	 */

	const DELAY_ENTER    = 200;
	const DELAY_FIGHTING = 100;
	const DELAY_MOVE     = 250;
	const DELAY_INITIAL  = 500;

	/**
	 * Choose a random element from the array.
	 */
	function chooseRandom(arr) {
		return arr[Math.floor(Math.random() * arr.length)];
	}

	/**
	 * Generator for each tile in the dungeon.
	 */
	function* eachTile(size=page.getGridSize()) {
		for (let x = 0; x < size; ++x) {
			for (let y = 0; y < size; ++y) {
				yield {x, y};
			}
		}
	}

	/**
	 * Get the coordinates of the boss tile if its location is known.
	 * Return null if not known.
	 */
	function getBossTile() {
		for (let pos of eachTile()) {
			if (page.tileIsBoss(pos.x, pos.y)) {
				return pos;
			}
		}

		return null;
	}

	/**
	 * Get a list of all known chest tiles in the dungeon.
	 */
	function getChestTiles() {
		let chests = [];

		for (let pos of eachTile()) {
			if (page.tileIsChest(pos.x, pos.y)) {
				chests.push(pos);
			}
		}

		return chests;
	}

	/**
	 * Get a list of all enemy chest tiles in the dungeon.
	 */
	function getEnemyTiles() {
		let chests = [];

		for (let pos of eachTile()) {
			if (page.tileIsEnemy(pos.x, pos.y)) {
				chests.push(pos);
			}
		}

		return chests;
	}

	/**
	 * Check if the player has explored all tiles.
	 */
	function exploredAllTiles() {
		for (let pos of eachTile()) {
			if (page.tileIsUnknown(pos.x, pos.y)) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Generate up to 4 positions surrounding the given tile.
	 */
	function* surroundingTiles(pos, size) {
		if (pos.y > 0) {
			yield {x: pos.x, y: pos.y - 1};
		}

		if (pos.x > 0) {
			yield {x: pos.x - 1, y: pos.y};
		}

		if (pos.y < size - 1) {
			yield {x: pos.x, y: pos.y + 1};
		}

		if (pos.x < size - 1) {
			yield {x: pos.x + 1, y: pos.y};
		}
	}

	/**
	 * Get a list of {x, y} objects for each unexplored tile which the player can access.
	 */
	function getExplorableTiles() {
		const size = page.getGridSize();
		const explorableTiles = [];

		for (let pos of eachTile(size)) {
			if (page.tileIsVisited(pos.x, pos.y)) {
				continue;
			}

			let isAccessible = false;
			for (let adjacentPos of surroundingTiles(pos, size)) {
				if (page.tileIsVisited(adjacentPos.x, adjacentPos.y)) {
					isAccessible = true;
					break;
				}
			}

			if (isAccessible) {
				explorableTiles.push(pos);
			}
		}

		return explorableTiles;
	}

	class DijkstraNode {
		constructor(pos, cost, parent) {
			this.pos = pos;
			this.cost = cost
			this.parent = parent;

			this.confirmed = false;
		}

		/**
		 * Update the path leading to this node, if it has a lower cost.
		 */
		updatePath(cost, parent) {
			if (!this.confirmed && cost < this.cost) {
				this.cost = cost;
				this.parent = parent;
			}
		}

		/**
		 * Trace this node's tree back to find the first non-explored step in the path.
		 * Note that the very first node in the chain will be a tile which the player has already explored.
		 * The second is the next tile which the player must explore in order to reach this node.
		 */
		findFirstStep() {
			let step = this;

			while (step.parent && step.parent.parent != null) {
				step = step.parent;
			}

			return step;
		}

		printPath() {
			this.parent.printPath();
			console.log("->", this.pos);
		}
	}

	/**
	 * Comparison function used to sort DijkstraNode by cost descending.
	 */
	function byCostDescending(nodeA, nodeB) {
		return nodeB.cost - nodeA.cost;
	}

	/**
	 * Compare two {x, y} position objects.
	 */
	function posEqual(posA, posB) {
		return posA.x == posB.x && posA.y == posB.y;
	}

	/**
	 * Create a key string based on a position.
	 */
	function posKey(pos) {
		return pos.x + "," + pos.y;
	}

	/**
	 * Find the shortest path to the given tile or to the furthest tile.
	 *
	 * @param targetTile {{x: number: y: number} | null} - Tile to navigate towards. If this is passed null, the function will instead navigate to the furthest tile.
	 * @param flash      {boolean}                       - Whether or not the player has flash in the current dungeon.
	 * @return           {DijkstraNode}                  - Path to targeted tile.
	 */
	function navigateTo(targetTile=null, flash=false) {
		const WEIGHT_EMPTY = 1;
		const WEIGHT_UNKNOWN_FLASH = 5;
		const WEIGHT_UNKNOWN = 40;
		const WEIGHT_ENEMY = 100;
	
		const weightUnknown = flash? WEIGHT_UNKNOWN_FLASH : WEIGHT_UNKNOWN;

		const size = page.getGridSize();

		const activeNodes = [];
		const allNodes = new Map();
		for (let pos of eachTile(size)) {
			if (page.tileIsVisited(pos.x, pos.y)) {
				const node = new DijkstraNode(pos, 0, null);
				activeNodes.push(node);
				allNodes.set(posKey(pos), node);
			}
		}

		let lastUnknownNode = null;

		while (activeNodes.length > 0) {
			activeNodes.sort(byCostDescending);
			const node = activeNodes.pop();

			if (targetTile && posEqual(node.pos, targetTile)) {
				return node;
			}

			for (let adjPos of surroundingTiles(node.pos, size)) {
				let stepCost;
				if (page.tileIsUnknown(adjPos.x, adjPos.y)) {
					stepCost = weightUnknown;
				} else if (page.tileIsEnemy(adjPos.x, adjPos.y)) {
					stepCost = WEIGHT_ENEMY;
				} else {
					stepCost = WEIGHT_EMPTY;
				}

				const pathCost = node.cost + stepCost;

				const adjKey = posKey(adjPos);
				let adjNode = allNodes.get(adjKey);
				if (adjNode) {
					adjNode.updatePath(pathCost, node);
				} else {
					adjNode = new DijkstraNode(adjPos, pathCost, node);
					activeNodes.push(adjNode);
					allNodes.set(adjKey, adjNode);
				}
			}

			node.confirmed = true;

			if (!targetTile && page.tileIsUnknown(node.pos.x, node.pos.y)) {
				lastUnknownNode = node;
			}
		}

		if (targetTile || lastUnknownNode == null) {
			throw new Error("Failed to navigate to the target");
		} else {
			return lastUnknownNode;
		}
	}

	class DungeonClearTask {
		constructor(dungeonName, clears) {
			this.dungeonName = dungeonName;
			this.playerClears = page.getDungeonClears(dungeonName);
			this.remainingEntries = clears;
			this.allowFail = false;

			this.taskEntries = 0;
			this.taskClears = 0;
		}

		logClear() {
			this.playerClears += 1;
			this.taskClears += 1;
		}

		logDungeonEnter() {
			this.remainingEntries -= 1;
			this.taskEntries += 1;
		}

		getTargetTiles() {
			const boss = getBossTile();
			if (boss) {
				return [boss];
			}

			return getChestTiles();
		}

		report() {
			console.log("Completed", this.taskClears,
					...(this.allowFail? ["of", this.taskEntries] : []),
					"clears of", this.dungeonName)
		}

		getOptions() {
			return {
				allowFail: (value=true) => {
					this.allowFail = !!value;
					console.log(value?
							"Allowing failures" : "Stopping on failure");
				}
			};
		}
	}

	class DungeonItemsTask extends DungeonClearTask {
		getTargetTiles() {
			const chests = getChestTiles();
			if (chests.length > 0) {
				return chests;
			}

			// Continue exploring if there are chests left to be found.
			if (page.hasHiddenChests()) {
				return [];
			}

			const boss = getBossTile();
			if (boss) {
				return [boss];
			}

			return [];
		}
	}

	/**
	 * Aims to fight all enemies before finishing the dungeon.
	 */
	class DungeonEnemiesTask extends DungeonClearTask {
		getTargetTiles() {
			const chests = getChestTiles();
			if (chests.length > 0) {
				return chests;
			}

			const enemies = getEnemyTiles();
			if (enemies.length > 0) {
				return enemies;
			}

			if (!exploredAllTiles()) {
				return [];
			}

			const boss = getBossTile();
			if (boss) {
				return [boss];
			}

			return [];
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

		if (!currentTask) {
			return;
		}

		if (!page.dungeonActive()) {
			const expectedClears = currentTask.playerClears + 1;
			const actualClears = page.getDungeonClears(currentTask.dungeonName);
			if (actualClears == expectedClears) {
				currentTask.logClear();
			} else if (!currentTask.allowFail) {
				console.log("Failed to clear dungeon");
				currentTask = null;
				return;
			}

			if (currentTask.remainingEntries <= 0) {
				currentTask.report();
				currentTask = null;
				return;
			}

			page.enterDungeon();
			currentTask.logDungeonEnter();

			scheduleTick(DELAY_ENTER);
			return;
		}

		if (page.dungeonBusy()) {
			scheduleTick(DELAY_FIGHTING);
			return;
		}

		const flash = page.hasFlash();

		// Navigate to the boss or a chest
		const targetTiles = currentTask.getTargetTiles();
		if (targetTiles.length > 0) {
			let bestPath = null;
			for (let pos of targetTiles) {
				const path = navigateTo(pos, flash);
				if (bestPath == null || path.cost < bestPath.cost) {
					bestPath = path;
				}
			}

			const nextStep = bestPath.findFirstStep();
			const nextTile = nextStep.pos;
			page.moveToTile(nextTile.x, nextTile.y);
			if (nextStep == bestPath) {
				page.activateTile();
			}

			scheduleTick(DELAY_MOVE);
			return;
		}

		// Or just explore tiles.
		const nextTile = navigateTo(null, flash).findFirstStep().pos;
		page.moveToTile(nextTile.x, nextTile.y);

		scheduleTick(DELAY_MOVE);
		return;
	}

	function cmdRun(clears=10) {
		const dungeonName = page.getCurrentDungeonName();
		currentTask = new DungeonClearTask(dungeonName, clears);
		scheduleTick(DELAY_INITIAL);
		console.log("Attempting to clear", dungeonName, currentTask.remainingEntries, "times");
		return currentTask.getOptions();
	}

	function cmdItems(clears=10) {
		const dungeonName = page.getCurrentDungeonName();
		currentTask = new DungeonItemsTask(dungeonName, clears, true);
		scheduleTick(DELAY_INITIAL);
		console.log("Attempting to clear", dungeonName, currentTask.remainingEntries, "times. Focusing on items.");
		return currentTask.getOptions();
	}

	function cmdEnemy(clears=10) {
		const dungeonName = page.getCurrentDungeonName();
		currentTask = new DungeonEnemiesTask(dungeonName, clears, true);
		scheduleTick(DELAY_INITIAL);
		console.log("Attempting to clear", dungeonName, currentTask.remainingEntries, "times. Focusing on enemies.");
		return currentTask.getOptions();
	}

	/**
	 * Script interoperability command.
	 * Check if the script is busy doing something.
	 *
	 * @return {boolean} - True if the script is doing something. False if not.
	 */
	function cmdBusy() {
		return currentTask != null;
	}

	/**
	 * Script interoperability command.
	 * Clear the current dungeon the specified number of times.
	 *
	 * @param amount {number} - Number of times to clear the dungeon.
	 */
	function cmdScriptClearDungeon(amount) {
		const dungeonName = page.getCurrentDungeonName();
		currentTask = new DungeonClearTask(dungeonName, amount);
		scheduleTick(DELAY_INITIAL);
	}

	(function main() {
		window.dung = {
			run: cmdRun,
			items: cmdItems,
			enemy: cmdEnemy,
		};

		if (!window.syfScripts) {
			window.syfScripts = {};
		}

		window.syfScripts.dungeonCrawler = {
			canClearDungeons() { return true; },
			busy: cmdBusy,
			clearDungeon: cmdScriptClearDungeon,
		};
	})();
})();

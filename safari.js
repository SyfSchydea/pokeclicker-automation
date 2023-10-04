// ==UserScript==
// @name         Pokeclicker - Safari Ranger
// @namespace    http://tampermonkey.net/
// @version      1.5.3+rocks
// @description  This script will automate the safari zone.
// @author       SyfP
// @match        https://www.pokeclicker.com/
// @grant        none
// ==/UserScript==

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

	// Enum used to identify types of tiles
	const TILE_EMPTY      = 0;
	const TILE_LONG_GRASS = 1;
	const TILE_WALL       = 2;

	const page = {
		/**
		 * Check if the player is currently on the safari.
		 *
		 * @return - Truthy if the player is in the safari, falsey if not.
		 */
		isOnSafari() {
			return Safari.inProgress();
		},

		/**
		 * Attempt to move in the given direction.
		 *
		 * @param dir {string} - "up", "down", "left", "right"
		 */
		move(dir) {
			if (!this.isOnSafari()) {
				return;
			}

			let button = null;
			switch (dir) {
				case "up":
					button = "ArrowUp";
					break;

				case "down":
					button = "ArrowDown";
					break;

				case "left":
					button = "ArrowLeft";
					break;

				case "right":
					button = "ArrowRight";
					break;

				default:
					throw new Error(`Invalid direction: '${dir}'`);
			}

			GameController.simulateKey(button);
			GameController.simulateKey(button, "up");
		},

		// Notes:
		// Safari.grid[y][x]:number
		//  0    -> Empty grass
		//  1- 9 -> Water pool
		// 10    -> long grass
		// 11-19 -> Empty sand

		// 25-36 -> Fence
		// 37-48 -> Big Tree

		/**
		 * Find what type of tile is at the given coordinates.
		 *
		 * @param x {number} - X coordinate to test.
		 * @param y {number} - Y coordinate to test.
		 * @return  {number} - TILE_EMPTY if the player can walk there,
		 *                     TILE_LONG_GRASS if the player can spawn random encounters there,
		 *                     TILE_WALL if the player cannot walk there.
		 */
		getTileType(x, y) {
			if (!Safari.canMove(x, y)) {
				return TILE_WALL;
			}

			if (Safari.grid[y][x] == 10) {
				return TILE_LONG_GRASS;
			}

			return TILE_EMPTY;
		},

		/**
		 * Find the coordinates of the player.
		 *
		 * @return {{x: number, y: number}} - Player coordinates.
		 */
		getPlayerPosition() {
			return Safari.playerXY;
		},

		// Safari.pokemonGrid()[]
		// Not actually a grid. It's a list of SafariPokemon objects, for each pokemon roaming the map
		// {
		//   id:    number, // dex id
		//   name:  string,
		//   shiny: bool,
		//   x:     number, // Position on the grid
		//   y:     number,
		//   steps: number, // Player steps until despawn. Despawns at 0
		//   // Plus a few other things which I don't think are relevant to this script
		// }

		/**
		 * Fetch a list of names of shiny pokemon on the safari grid.
		 *
		 * @return - Array-like of shiny pokemon names as strings.
		 */
		getShinyPokemonOnGrid() {
			const onGridPokemon = Safari.pokemonGrid();
			const shinies = [];
			for (let i = 0; i < onGridPokemon.length; ++i) {
				const pkmn = onGridPokemon[i];

				if (pkmn.shiny) {
					shinies.push(pkmn.name);
				}
			}

			return shinies;
		},

		/**
		 * Test if the player is currently in a battle with a pokemon on the safari.
		 *
		 * @return - Truthy if in a battle, falsey if not.
		 */
		inBattle() {
			return Safari.inBattle();
		},

		/**
		 * Test if the pokemon which the player is battling is a shiny.
		 * Behaviour is undefined if the player is not currently in a safari battle.
		 *
		 * @return - Truthy if the battle pokemon is shiny, falsey if not.
		 */
		battlePokemonIsShiny() {
			const enemy = SafariBattle.enemy; // SafariPokemon object
			return enemy && enemy.shiny;
		},

		/**
		 * Find the name of the pokemon which the player is currently battling.
		 * Behaviour is undefined if the player is not currently in a safari battle.
		 *
		 * @return {string} - Name of the battle pokemon.
		 */
		getBattlePokemonName() {
			const enemy = SafariBattle.enemy; // SafariPokemon object
			return enemy && enemy.name;
		},

		/**
		 * Test if the player has obtained a shiny of the given species.
		 *
		 * @param pkmnName {string} - Name of the species to check.
		 * @return                  - Truthy if the player has this shiny, falsey if not.
		 */
		hasShiny(pkmnName) {
			return App.game.party.alreadyCaughtPokemonByName(pkmnName, true);
		},

		/**
		 * Check if the battle process is busy.
		 *
		 * @return - Truthy if the SafariBattle is busy. False if not.
		 */
		battleIsBusy() {
			return SafariBattle.busy();
		},

		/**
		 * Make the SafariBattle not be busy.
		 * There is a bug where sometimes the busy flag gets stuck on, and the whole UI becomes completely soft-locked.
		 * This function may be used to fix this state, but also may be considered kind of cheaty, so use sparingly.
		 */
		battleFixStuckBusy() {
			SafariBattle.busy(false);
		},

		/**
		 * Attempt to run from the current safari battle.
		 */
		runFromBattle() {
			this.isOnSafari() && this.inBattle() && !SafariBattle.busy() && SafariBattle.run();
		},

		/**
		 * Attempt to throw a rock at the current enemy pokemon.
		 */
		throwRock() {
			this.isOnSafari() && this.inBattle() && !SafariBattle.busy() && SafariBattle.throwRock();
		},

		/**
		 * Get the number of balls the player has left.
		 *
		 * @return {number} - Number of balls.
		 */
		getBallCount() {
			return Safari.balls();
		},

		/**
		 * Attempt to throw a pokeball at the current enemy pokemon.
		 */
		throwBall() {
			if (!this.isOnSafari() || !this.inBattle() || SafariBattle.busy() || this.getBallCount() <= 0) {
				return;
			}

			SafariBattle.throwBall();
		},

		_battleEncounters: 0,
		_lastBattleEncounter: null,

		/**
		 * Each time this is called, increment its return value if a new encounter has been seen.
		 * This is expected to be called frequently, and is not expected to account for
		 * encounters which occurred entirely between two calls of this function.
		 *
		 * @return {number} - Number of distinct battle encounters observed by calls to this function.
		 */
		countBattleEncounters() {
			const currentEncounter = SafariBattle.enemy;
			if (this._lastBattleEncounter != currentEncounter) {
				this._battleEncounters += 1;
				this._lastBattleEncounter = currentEncounter;
			}

			return this._battleEncounters;
		},

		/**
		 * Get the player's current level.
		 *
		 * @return {number} - Player's current safari level.
		 */
		getLevel() {
			return Safari.safariLevel();
		},

		/**
		 * Find the max level which the player can achieve.
		 *
		 * @return {number} - Safari level cap.
		 */
		getLevelCap() {
			return Safari.maxSafariLevel;
		},

		/**
		 * Find the location of any item on the grid.
		 * If multiple items are present, any one of them may be selected.
		 * Cleanly returns null if no items are present.
		 *
		 * @return {{x: number, y:number} | null} - Object containing an item's x and y coordinates,
		 *                                          or null if no items are present.
		 */
		getItemLocation() {
			const items = Safari.itemGrid();
			if (items.length <= 0) {
				return null;
			}

			return items[0];
		},

		/**
		 * Calculate the catch rate which the current enemy will have when angered,
		 * even if they are not currently angered.
		 * Factor is to be returned on a scale of 0 to 1, not as a percentage.
		 *
		 * @return {number} - Battle enemy catch rate when angered.
		 */
		getEnemyAngryCatchRate() {
			const enemy = SafariBattle.enemy;

			// Based on SafariPokemon.catchFactor in the game's code
			const levelMod = enemy.levelModifier;
			const baseCatchPercentage = enemy.baseCatchFactor;
			const catchPercentage = baseCatchPercentage + levelMod * 10
			const angryCatchPercentage = catchPercentage * (2 + levelMod);
			return angryCatchPercentage / 100;
		},

		/**
		 * Check if the current battle enemy is angry.
		 *
		 * @return - Truthy if the enemy is angry, falsey if not.
		 */
		enemyAngered() {
			return SafariBattle.enemy.angry > 0;
		},

		/**
		 * Fetch the save key of the currently loaded save.
		 *
		 * @return {string} - Save key if currently logged in, or an empty string if not.
		 */
		getSaveKey() {
			return Save.key;
		},
	};

	//////////////////////////

	/*
	 * The main functionality of the script should go here.
	 *
	 * Any interaction with the page should only be done
	 * through the page interface defined above.
	 */

	const WINDOW_KEY = "sr";

	const DELAY_TASK_START = 1000;
	const DELAY_WALK       =  250;
	const DELAY_BATTLE     = 1500;

	const SETTINGS_SCOPE_SAVE = {
		storage: localStorage,
		getKey: () => "syfschydea--farm--settings--" + page.getSaveKey(),
	};
	const SETTINGS_SCOPE_SESSION = {
		storage: sessionStorage,
		getKey: () => "syfschydea--farm--settings",
	};

	/**
	 * Holds info about a single value which exists in settings.
	 */
	class Setting {
		// readFn may be passed to process the raw value when reading
		constructor(scope, key, defaultVal, readFn=x=>x) {
			this.scope = scope;
			this.key = key;
			this.defaultVal = defaultVal;
			this.readFn = readFn;
		}

		_read() {
			const settingsJson = this.scope.storage.getItem(
					this.scope.getKey());

			if (!settingsJson) {
				return {};
			}

			return JSON.parse(settingsJson);
		}

		get() {
			const settings = this._read();

			if (!(this.key in settings)) {
				return this.defaultVal;
			}

			return this.readFn(settings[this.key]);
		}

		set(val) {
			const settings = this._read();
			settings[this.key] = val;
			this.scope.storage.setItem(this.scope.getKey(),
					JSON.stringify(settings));
		}
	}

	Setting.useRocks = new Setting(SETTINGS_SCOPE_SAVE, "useRocks", true);

	const DIRECTIONS = {
		"up":    {x:  0, y: -1},
		"down":  {x:  0, y:  1},
		"left":  {x: -1, y:  0},
		"right": {x:  1, y:  0},
	};

	function xyAdd(a, b) {
		return {
			x: a.x + b.x,
			y: a.y + b.y,
		};
	}

	function xyEqual(a, b) {
		return a.x == b.x && a.y == b.y;
	}

	class DijkstraNode {
		constructor(pos, cost, parent, sourceDir) {
			this.pos = pos;
			this.cost = cost
			this.parent = parent;
			this.sourceDir = sourceDir;

			this.confirmed = false;
		}

		/**
		 * Update the path leading to this node, if it has a lower cost.
		 */
		updatePath(cost, parent, sourceDir) {
			if (!this.confirmed && cost < this.cost) {
				this.cost = cost;
				this.parent = parent;
				this.sourceDir = sourceDir;
			}
		}

		/**
		 * Trace this node's tree back to find the first step in the path.
		 * Note that the very first node in the chain will be the player's current position.
		 * The second is the next tile which the player must walk to in order to reach this node.
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
	 * Create a key string based on a position.
	 */
	function posKey(pos) {
		return pos.x + "," + pos.y;
	}

	/**
	 * Navigate from the current player position to any tile matching the given predicate.
	 * Will always return a path of at least length one.
	 *
	 * @param {function({x: number, y: number})->bool} - Function which determines which
	 *                                                   tiles are valid destinations.
	 *                                                   Takes the tile's position, and returns
	 *                                                   true if it's a valid destination.
	 * @return {DijkstraNode}                          - Path to the nearest target tile.
	 */
	function dijkstra(targetTilePred) {
		const startNode = new DijkstraNode(page.getPlayerPosition(), 0, null, "start");

		const activeNodes = [startNode];
		const allNodes = new Map();
		allNodes.set(posKey(startNode.pos, startNode));

		while (activeNodes.length > 0) {
			activeNodes.sort(byCostDescending);
			const node = activeNodes.pop();

			if (targetTilePred(node.pos) && node.dir != "start") {
				return node;
			}

			for (const [dir, dirVec] of Object.entries(DIRECTIONS)) {
				const nextPos = xyAdd(node.pos, dirVec);

				if (page.getTileType(nextPos.x, nextPos.y) == TILE_WALL) {
					continue;
				}

				const nextKey = posKey(nextPos);
				let nextNode = allNodes.get(nextKey);
				if (nextNode) {
					nextNode.updatePath(node.cost + 1, node, dir);
				} else {
					nextNode = new DijkstraNode(nextPos, node.cost + 1, node, dir);
					activeNodes.push(nextNode);
					allNodes.set(nextKey, nextNode);
				}
			}

			node.confirmed = true;
		}

		throw new Error("Failed to navigate to target");
	}

	// Test if the given position is long grass.
	// Will return false for single tiles as there are not useful for grinding.
	function isLongGrass(pos) {
		if (page.getTileType(pos.x, pos.y) != TILE_LONG_GRASS) {
			return false;
		}

		for (const [dir, vec] of Object.entries(DIRECTIONS)) {
			const adjPos = xyAdd(pos, vec);

			if (page.getTileType(adjPos.x, adjPos.y) == TILE_LONG_GRASS) {
				return true;
			}
		}

		return false;
	}

	// Attempt to walk into any long grass tile
	function walkToLongGrass() {
		// Try to find any nearby grass
		const playerPos = page.getPlayerPosition();
		for (const [dir, vec] of Object.entries(DIRECTIONS)) {
			const tile = xyAdd(playerPos, vec);

			if (isLongGrass(tile)) {
				page.move(dir);
				return;
			}
		}

		// Navigate to the grass if its further away
		const path = dijkstra(isLongGrass);
		const nextDir = path.findFirstStep().sourceDir;
		page.move(nextDir);
	}

	/**
	 * Attempt to walk towards the given position.
	 *
	 * @param itemPos {{x: number, y: number}} - Object with x and y coordinates to navigate towards.
	 */
	function walkTowards(itemPos) {
		if (xyEqual(page.getPlayerPosition(), itemPos)) {
			return;
		}

		const path = dijkstra(pos => xyEqual(pos, itemPos));
		const nextDir = path.findFirstStep().sourceDir;
		page.move(nextDir);
	}

	let _busyStreak = 0;
	// Call battleFixStuckBusy if the game has been busy for too long.
	// return true if battleFixStuckBusy was called.
	function unstuckBusy() {
		if (!page.isOnSafari() || !page.inBattle()) {
			return false;
		}

		if (page.battleIsBusy()) {
			_busyStreak += 1;
		} else {
			_busyStreak = 0;
			return false;
		}

		if (_busyStreak >= 10) {
			page.battleFixStuckBusy();
			_busyStreak = 0;
			return true;
		}

		return false;
	}

	// Attempt to find any shiny
	class FindShinyTask {
		constructor(allowDupe=false) {
			this.allowDupe = allowDupe;

			this.startBattleEncounters = page.countBattleEncounters();
			this.lastEncounterReport = 0;
			this.recentGridShinies = [];
		}

		getEncounterCount() {
			const encounterCount = page.countBattleEncounters();
			return encounterCount - this.startBattleEncounters;
		}

		reportDupeShiny(name) {
			/*
			 * This check exists to avoid reporting on a dupe shiny on the field multiple times.
			 * This method does have a minor bug in that if a dupe shiny spawns
			 * while another shiny of the same species is already present, or despawned the previous frame,
			 * then it won't report on that second shiny.
			 * But since this is such a rare occurrence, and it can only concern a dupe shiny we aren't hunting,
			 * I'm choosing not to care about it.
			 */
			if (this.recentGridShinies.includes(name)) {
				return;
			}

			const count = this.getEncounterCount();

			if (count > this.lastEncounterReport) {
				console.log("Ignoring duplicate shiny", name,
						"at", count, "encounters");
				this.lastEncounterReport = count;
			}
		}

		describe() {
			return "find a " + (this.allowDupe? "" : "new ") + "shiny pokemon";
		}

		hasExpired() {
			if (!page.isOnSafari()) {
				return true;
			}

			let foundShiny = false;
			const currentGridShinies = page.getShinyPokemonOnGrid();
			for (let i = 0; i < currentGridShinies.length; ++i) {
				if (this.allowDupe) {
					foundShiny = true;
					break;
				}

				const shiny = currentGridShinies[i];
				if (page.hasShiny(shiny)) {
					this.reportDupeShiny(shiny);
				} else {
					foundShiny = true;
					break;
				}
			}

			battleShinyCheck: if (page.inBattle() && page.battlePokemonIsShiny()) {
				if (this.allowDupe) {
					foundShiny = true;
					break battleShinyCheck;
				}

				const shinyName = page.getBattlePokemonName();
				if (page.hasShiny(shinyName)) {
					this.reportDupeShiny(shinyName);
				} else {
					foundShiny = true;
				}
			}

			this.recentGridShinies = currentGridShinies;

			if (foundShiny) {
				const taskEncounters = this.getEncounterCount();
				console.log("Found a " + (this.allowDupe? "" : "new ")
						+ "shiny after", taskEncounters, "battle encounters");
			}

			return foundShiny;
		}

		action() {
			if (page.inBattle()) {
				const taskEncounters = this.getEncounterCount();

				if (unstuckBusy()) {
					return DELAY_BATTLE;
				}

				// Only report round (1sf) numbers eg. 100, 200, 1000, 50000, etc.
				if (taskEncounters > this.lastEncounterReport && taskEncounters >= 100
						&& taskEncounters % 10 ** Math.floor(Math.log10(taskEncounters)) == 0) {
					console.log("Encountered", taskEncounters, "battles so far");
					this.lastEncounterReport = taskEncounters;
				}

				page.runFromBattle();
				return DELAY_BATTLE;
			}

			walkToLongGrass();
			return DELAY_WALK;
		}
	}

	// Throw rocks until a given level
	class GrindLevelTask {
		constructor(targetLevel) {
			const levelCap = page.getLevelCap();
			if (targetLevel > levelCap) {
				console.log(`Level ${targetLevel} is too high. Aiming for level ${levelCap} instead`);
				targetLevel = levelCap;
			}

			this.targetLevel = targetLevel;
		}

		describe() {
			return "grind for safari level " + this.targetLevel;
		}

		hasExpired() {
			return (!page.isOnSafari()
					|| page.getLevel() >= this.targetLevel
					|| !Setting.useRocks.get())
		}

		action() {
			if (page.inBattle()) {
				if (unstuckBusy()) {
					return DELAY_BATTLE;
				}

				page.throwRock();
				return DELAY_BATTLE;
			}

			walkToLongGrass();
			return DELAY_WALK;
		}
	}

	// Catch pokemon for item drops.
	// Will throw rocks at pokemon with high catch rates to maximise catches per ball.
	class ItemsTask {
		describe() {
			return "grind for item drops";
		}

		hasExpired() {
			return !page.isOnSafari();
		}

		action() {
			const lastBall = page.getBallCount() <= 1;
			const itemPos = page.getItemLocation();

			if (page.inBattle()) {
				if (unstuckBusy()) {
					return DELAY_BATTLE;
				}

				if (lastBall) {
					if (itemPos != null) {
						// Run from battles on the last ball so we can pick up the items
						page.runFromBattle();
					} else {
						// Use the last ball once all items have been picked up
						page.throwBall();
					}
				} else if (page.getEnemyAngryCatchRate() < 0.7) {
					// Only attempt to catch pokemon which have a decent chance of catching.
					page.runFromBattle();
				} else if (!page.enemyAngered() && Setting.useRocks.get()) {
					// Throw rocks at enemies to anger them before using the balls on them.
					page.throwRock();
				} else {
					page.throwBall();
				}

				return DELAY_BATTLE;
			}

			if (itemPos != null) {
				walkTowards(itemPos);
			} else {
				walkToLongGrass();
			}

			return DELAY_WALK;
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

		if (currentTask.hasExpired()) {
			console.log("Safari Ranger task expired");
			currentTask = null;
			return;
		}

		const nextDelay = currentTask.action();
		scheduleTick(nextDelay);
	}

	function startTask(task) {
		currentTask = task;
		console.log("Safari Ranger is starting to " + task.describe());
		scheduleTick(DELAY_TASK_START);
	}

	function cmdFindShiny(allowDupes=false) {
		startTask(new FindShinyTask(allowDupes));
	}

	function cmdGrindLevel(targetLevel) {
		if (typeof targetLevel != "number" || targetLevel <= 0) {
			throw new Error("targetLevel must be a positive number");
		}

		if (!Setting.useRocks.get()) {
			throw new Error("Can't grind levels without using rocks.\n"
				+ `Call ${WINDOW_KEY}.useRocks(true) to enable rocks.`);
		}

		startTask(new GrindLevelTask(targetLevel));
	}

	function cmdItems() {
		startTask(new ItemsTask());
	}

	function cmdStop() {
		currentTask = null;
	}

	/**
	 * User-facing command.
	 * Set whether the script should use rocks and normal bait
	 * on pokemon in the safari zone.
	 * On ACSRQ saves, this should be set to false.
	 */
	function cmdUseRocks(value=true) {
		Setting.useRocks.set(!!value);

		console.log((value? "Started" : "Stopped"),
				"using rocks and normal bait");
	}

	(function main() {
		window[WINDOW_KEY] = {
			findShiny:  cmdFindShiny,
			stop:       cmdStop,
			grindLevel: cmdGrindLevel,
			items:      cmdItems,
			useRocks:   cmdUseRocks,
		};
	})();
})();

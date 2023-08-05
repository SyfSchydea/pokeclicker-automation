// ==UserScript==
// @name         Pokeclicker - Safari Ranger
// @namespace    http://tampermonkey.net/
// @version      1.3
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
		 * Test if there is a shiny pokemon currently on the safari grid.
		 *
		 * @return - Truthy if there is a shiny pokemon currently on the grid, falsey if not.
		 */
		isShinyPokemonOnGrid() {
			const onGridPokemon = Safari.pokemonGrid();
			for (let i = 0; i < onGridPokemon.length; ++i) {
				const pkmn = onGridPokemon[i];

				if (pkmn.shiny) {
					return true;
				}
			}

			return false;
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

	// Attempt to walk into any adjacent long grass tile
	function walkToLongGrass() {
		const playerPos = page.getPlayerPosition();

		for (const [dir, vec] of Object.entries(DIRECTIONS)) {
			const tile = xyAdd(playerPos, vec);

			if (page.getTileType(tile.x, tile.y) == TILE_LONG_GRASS) {
				page.move(dir);
				return;
			}
		}

		throw new Error("Failed to find nearby grass");
	}

	// Attempt to find any shiny
	class FindShinyTask {
		constructor() {
			this.startBattleEncounters = page.countBattleEncounters();
			this.lastEncounterReport = 0;
		}

		describe() {
			return "find a shiny pokemon";
		}

		hasExpired() {
			if (!page.isOnSafari()) {
				return true;
			}

			if (page.isShinyPokemonOnGrid()
					|| (page.inBattle() && page.battlePokemonIsShiny())) {
				const endBattleEncounters = page.countBattleEncounters();
				const taskEncounters = endBattleEncounters - this.startBattleEncounters;
				console.log("Found a shiny after", taskEncounters, "battle encounters");
				return true;
			}

			return false;
		}

		action() {
			if (page.inBattle()) {
				const encounterCount = page.countBattleEncounters();
				const taskEncounters = encounterCount - this.startBattleEncounters;

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
					|| page.getLevel() >= this.targetLevel)
		}

		action() {
			if (page.inBattle()) {
				page.throwRock();
				return DELAY_BATTLE;
			}

			walkToLongGrass();
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

	function cmdFindShiny() {
		startTask(new FindShinyTask());
	}

	function cmdGrindLevel(targetLevel) {
		if (typeof targetLevel != "number" || targetLevel <= 0) {
			console.error("targetLevel must be a positive number");
			return;
		}

		startTask(new GrindLevelTask(targetLevel));
	}

	function cmdStop() {
		currentTask = null;
	}

	(function main() {
		window[WINDOW_KEY] = {
			findShiny:  cmdFindShiny,
			stop:       cmdStop,
			grindLevel: cmdGrindLevel,
		};
	})();
})();

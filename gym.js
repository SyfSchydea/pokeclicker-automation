// ==UserScript==
// @name         Poké-clicker - Gym Runner
// @namespace    http://tampermonkey.net/
// @version      1.4.1
// @description  Runs gyms automatically.
// @author       SyfP
// @match        https://www.pokeclicker.com/
// @grant        none
// ==/UserScript==

/* global App, GameConstants, GymRunner, player */

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
		 * Fetch the gym for the current area.
		 *
		 * @param n {number|string} - 1-indexed index for the Elite 4
		 *                            or Champion fight or 0 for a regular gym.
		 *                            Or the name of the gym to find
		 *                            as a string.
		 * @return  {Gym}           - Gym object.
		 */
		_getGym(n=0) {
			const gyms = player.town.content.filter(c => c instanceof Gym);

			switch (typeof n) {
				case "number": {
					const idx = n == 0? 0 : n - 1;

					if (!(idx in gyms)) {
						throw new Error("Gym", n, "not found");
					}

					return gyms[idx];
				}

				case "string": {
					const gym = gyms.find(g => g.town == n);

					if (!gym) {
						throw new Error("Gym", n, "not found");
					}

					return gym;
				}

				default:
					throw new Error("Invalid type for n: " + (typeof n));
			}
		},

		/**
		 * Get a list of gyms at the current location.
		 * This will usually only a singleton if at a regular gym,
		 * an empty list if not at any kind of gym,
		 * or a list with 5 entries if at the elite 4.
		 *
		 * @return {string[]} - Array of gym names.
		 */
		getCurrentGyms() {
			return player.town.content
				.filter(c => c instanceof Gym)
				.map(g => g.town);
		},

		/**
		 * Find the region which a gym belongs to.
		 *
		 * @param gym {string} - Gym name.
		 * @return    {string} - Region name.
		 */
		getGymRegion(gym) {
			return GameConstants.Region[GymList[gym].parent.region];
		},

		/**
		 * Get the number of pokemon in the given gym.
		 *
		 * @param gym {string} - Gym name.
		 * @return    {number} - Number of pokemon in the gym.
		 */
		getGymPokemonCount(gym) {
			return GymList[gym].pokemons.length;
		},

		/**
		 * Fetch the name of the given pokemon in the given gym.
		 *
		 * @param gym {string} - Gym name.
		 * @param idx {number} - Index of the pokemon to look up.
		 * @return    {string} - Pokemon name.
		 */
		getGymPokemon(gym, idx) {
			return GymList[gym].pokemons[idx].name;
		},

		/**
		 * Fetch the HP of the given pokemon in the given gym.
		 *
		 * @param gym {string} - Gym name.
		 * @param idx {number} - Index of the pokemon to look up.
		 * @return    {string} - Pokemon name.
		 */
		getGymPokemonHP(gym, idx) {
			return GymList[gym].pokemons[idx].maxHealth;
		},

		/**
		 * Start the gym which the player is currently at.
		 *
		 * @param n {number|string} - 1-indexed index for the Elite 4
		 *                            or Champion fight or 0 for a regular gym.
		 *                            Or the name of the gym to find
		 *                            as a string.
		 */
		startGym(n=0) {
			if (App.game.gameState != GameConstants.GameState.town) {
				throw new Error("Player is not currently at a tomn");
			}

			GymRunner.startGym(this._getGym(n));
		},

		/**
		 * Check if the player is currently at a town with a gym.
		 *
		 * @param n {number|string} - 1-indexed index for the Elite 4
		 *                            or Champion fight or 0 for a regular gym.
		 *                            Or the name of the gym to find
		 *                            as a string.
		 * @return                  - Truthy if the player is at a gym.
		 *                            Falsey if not.
		 */
		canStartGym(n=0) {
			return App.game.gameState == GameConstants.GameState.town && this._getGym(n);
		},

		/**
		 * Check how many times the player has completed the current gym.
		 *
		 * @param n {number|string} - 1-indexed index for the Elite 4
		 *                            or Champion fight or 0 for a regular gym.
		 *                            Or the name of the gym to find
		 *                            as a string.
		 * @return  {number}        - Number of clears.
		 */
		getGymClears(n=0) {
			const name = this._getGym(n).town;
			const gymIdx = GameConstants.getGymIndex(name);
			return App.game.statistics.gymsDefeated[gymIdx]();
		},

		/**
		 * Get the player's current pokemon attack damage.
		 *
		 * @return {number} - Attack damage.
		 */
		getCurrentDamage() {
			return App.game.party.pokemonAttackObservable();
		},

		/**
		 * Get the damage the player currently deals against
		 * the given pokemon in the given region.
		 * May assume clear weather
		 *
		 * @param pokemonName {string} - Name of target pokemon.
		 * @param regionName  {string} - Name of region to assume.
		 * @return            {number} - Damage dealt by player.
		 */
		getDamageAgainst(pokemonName, regionName) {
			const pkmn = PokemonHelper.getPokemonByName(pokemonName);
			const region = GameConstants.Region[regionName];

			return App.game.party.calculatePokemonAttack(
					pkmn.type1,
					pkmn.type2,
					false, // don't ignore region multiplier
					region,
					false, // Don't include breeding pokemon
					false, // Don't use base attack
					WeatherType.Clear,
					false // Don't ignore level
				);
		},
	};

	//////////////////////////

	/*
	 * The main functionality of the script should go here.
	 *
	 * Any interaction with the page should only be done
	 * through the page interface defined above.
	 */

	const DELAY_TICK = 2 * 1000;
	const DELAY_INIT =      500;

	const WINDOW_KEY = "gym";

	const STOP_TASK = Symbol("STOP_TASK");

	class GymTask {
		constructor(clears, eliteIdx=0) {
			const currentClears = page.getGymClears(eliteIdx);

			this.targetClears = currentClears + clears, 100;
			this.expectedClears = currentClears;
			this.eliteIdx = eliteIdx;
		}

		hasExpired() {
			return page.getGymClears(this.eliteIdx) >= this.targetClears;
		}

		action() {
			if (!page.canStartGym(this.eliteIdx)) {
				return DELAY_TICK;
			}

			const currentClears = page.getGymClears(this.eliteIdx);
			if (currentClears < this.expectedClears) {
				return STOP_TASK;
			}

			page.startGym(this.eliteIdx);
			this.expectedClears = currentClears + 1;
		}
	}

	let currentTask = null;
	let tickTimeoutId = null;

	function scheduleTick(delay) {
		if (tickTimeoutId != null) {
			clearTimeout(tickTimeoutId);
		}

		tickTimeoutId = setTimeout(tick, DELAY_TICK);
	}

	function tick() {
		tickTimeoutId = null;

		if (!currentTask) {
			return;
		}

		if (currentTask.hasExpired()) {
			console.log("Gym Task expired");
			currentTask = null;
			return;
		}

		const actionResult = currentTask.action();
		if (actionResult == STOP_TASK) {
			console.log("Gym Task stopped early");
			currentTask = null;
			return;
		}

		scheduleTick(actionResult);
	}

	function validateClearCount(clearCount, idx=0) {
		if (typeof clearCount != "number") {
			throw new Error("Parameter clearCount should be a number");
		}

		if (clearCount < 0) {
			throw new Error("clearCount must be non-negative");
		}

		return clearCount;
	}

	function timeToKillPokemon(gym, idx, damageMultiplier=1) {
		const pokemon = page.getGymPokemon(gym, idx);
		const region = page.getGymRegion(gym);
		const damage = Math.round(page.getDamageAgainst(pokemon, region)
				* damageMultiplier);

		return Math.ceil(page.getGymPokemonHP(gym, idx) / damage);
	}

	function timeToKillGym(gym, damageMultiplier=1) {
		const pkmnCount = page.getGymPokemonCount(gym);

		let ttk = 0;
		for (let i = 0; i < pkmnCount; ++i) {
			ttk += timeToKillPokemon(gym, i, damageMultiplier);
		}

		return ttk;
	}

	function estimateRequiredGymDmg(gym) {
		const REQUIRED_TTK = 30;

		let min = 0;
		let max = 1;

		// Increase max
		while (timeToKillGym(gym, max) > REQUIRED_TTK) {
			max *= 2;
		}

		// Hone in on exact value
		while (max - min > 0.00001) {
			const mid = (max + min) / 2;

			if (timeToKillGym(gym, mid) <= REQUIRED_TTK) {
				max = mid;
			} else {
				min = mid;
			}
		}

		return Math.ceil(max * page.getCurrentDamage());
	}

	function cmdRun(clearCount=100) {
		clearCount = validateClearCount(clearCount);

		const currentClears = page.getGymClears();
		currentTask = new GymTask(clearCount);
		console.log("Attempting", currentTask.targetClears - currentClears, "gym clears");
		scheduleTick(DELAY_INIT);
	}

	function cmdElite(idx, clearCount=100) {
		if (typeof idx != "number") {
			throw new Error("Parameter idx should be a number");
		}

		if (idx < 1 || idx > 5) {
			throw new Error("idx should be between 1 and 5. 1-4 for each of the Elite 4, 5 for the Champion");
		}

		clearCount = validateClearCount(clearCount, idx);

		const currentClears = page.getGymClears(idx);
		currentTask = new GymTask(clearCount, idx);
		console.log("Attempting", currentTask.targetClears - currentClears, "Elite 4 clears");
		scheduleTick(DELAY_INIT);
	}

	/**
	 * Script interoperability command.
	 * Clear the selected gym the given number of times.
	 *
	 * @param gymName {string} - Name of the gym to clear.
	 *                           This should be at the player's current town.
	 * @param count   {number} - Number of times the gym should be cleared.
	 */
	function cmdScriptClearGym(gymName, count=1) {
		currentTask = new GymTask(count, gymName);
		scheduleTick(DELAY_INIT);
	}

	/**
	 * Check if the script is busy, and should receive new commands now.
	 *
	 * @return {boolean} - True if there is an active command. False if not.
	 */
	function cmdBusy() {
		return currentTask != null;
	}

	/**
	 * Show the estimated damage required to beat the current gym.
	 */
	function cmdEstDmg() {
		const gyms = page.getCurrentGyms();
		if (gyms.length <= 0) {
			throw new Error("There are no gyms here");
		}

		console.log(gyms
			.map(g => g + " requires " + estimateRequiredGymDmg(g))
			.join("\n"));
	}

	(function main() {
		window[WINDOW_KEY] = {
			run:             cmdRun,
			elite:           cmdElite,
			estimatedDamage: cmdEstDmg,
		};

		if (!window.syfScripts) {
			window.syfScripts = {};
		}

		window.syfScripts.gym = {
			canClearGyms() { return true; },
			busy: cmdBusy,
			clearGym: cmdScriptClearGym,
		}
	})();
})();

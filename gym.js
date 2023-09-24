// ==UserScript==
// @name         Poké-clicker - Gym Runner
// @namespace    http://tampermonkey.net/
// @version      1.3.1
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
			const gyms = player.town().content.filter(c => c instanceof Gym);

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

	(function main() {
		window[WINDOW_KEY] = {
			run:   cmdRun,
			elite: cmdElite,
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

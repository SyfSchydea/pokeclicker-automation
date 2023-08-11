// ==UserScript==
// @name         Poké-clicker - Gym Runner
// @namespace    http://tampermonkey.net/
// @version      1.2.1.1
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
		 * @param n {number} - 1-indexed index for the Elite 4 or Champion fight or 0 for a regular gym.
		 * @return  {Gym}    - Gym object.
		 */
		_getGym(n=0) {
			const idx = n == 0? 0 : n - 1;

			const gyms = player.town().content.filter(c => c instanceof Gym);
			if (!(idx in gyms)) {
				throw new Error("Gym", n, "not found");
			}

			return gyms[idx];
		},

		/**
		 * Start the gym which the player is currently at.
		 *
		 * @param n {number} - 1-indexed index for the Elite 4 or Champion fight or 0 for a regular gym.
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
		 * @param n {number} - 1-indexed index for the Elite 4 or Champion fight or 0 for a regular gym.
		 * @return           - Truthy if the player is at a gym. Falsey if not.
		 */
		canStartGym(n=0) {
			return App.game.gameState == GameConstants.GameState.town && this._getGym(n);
		},

		/**
		 * Check how many times the player has completed the current gym.
		 *
		 * @return {number} - Number of clears.
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
			throw new Error("Paramater idx should be a number");
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

	(function main() {
		window[WINDOW_KEY] = {
			run:   cmdRun,
			elite: cmdElite,
		};
	})();
})();

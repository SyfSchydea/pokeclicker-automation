// ==UserScript==
// @name         Pokeclicker - Offline Earnings on Sleep
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  Award offline earnings on significant time skips (eg. PC sleep)
// @author       SyfP
// @match        https://www.tampermonkey.net
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

	const page = {
		/**
		 * Fetch a timestamp of when the game was last saved.
		 *
		 * @return {number|Date} - Time of last game save.
		 */
		getLastSaveTime() {
			return player._lastSeen;
		},

		/**
		 * Trigger the in-game offline earnings.
		 */
		triggerOfflineEarnings() {
			App.game.computeOfflineEarnings();
		},
	};

	//////////////////////////

	/*
	 * The main functionality of the script should go here.
	 *
	 * Any interaction with the page should only be done
	 * through the page interface defined above.
	 */

	// Required time skip to trigger offline earnings
	const MIN_TIME_SKIP = 60 * 60 * 1000; // 1 hour

	// Cooldown on offline earnings to avoid triggering multiple times for the same interval.
	const EARNINGS_COOLDOWN = 5 * 60 * 1000; // 5 minutes

	// How often to tick
	const TICK_INTERVAL = 5 * 1000; // 5 seconds

	let lastEarningsTrigger = 0;

	function timeDeltaStr(ms) {
		if (ms < 100) {
			return `${ms}ms`;
		}

		const seconds = ms / 1000;
		if (seconds < 60) {
			return `${seconds.toPrecision(2)} seconds`;
		}

		return `${seconds.toFixed(0)} seconds`;
	}

	function tick() {
		const now = +new Date();
		const lastSave = +page.getLastSaveTime();

		if (now >= lastSave + MIN_TIME_SKIP
				&& now >= lastEarningsTrigger + EARNINGS_COOLDOWN) {
			page.triggerOfflineEarnings();
			console.log("Awarding offline earnings for " + timeDeltaStr(now - lastSave) + " time skip");
			lastEarningsTrigger = now;
		}
	}

	(function main() {
		setInterval(tick, TICK_INTERVAL);
	})();
})();

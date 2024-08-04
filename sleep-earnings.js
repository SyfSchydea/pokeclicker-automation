// ==UserScript==
// @name         Pokeclicker - Offline Earnings on Sleep
// @namespace    http://tampermonkey.net/
// @version      1.1.1
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

		/**
		 * Check if the player has unlocked dream orbs.
		 *
		 * @return - Truthy if dream orbs are unlocked, falsey otherwise.
		 */
		unlockedDreamOrbs() {
			return (new DreamOrbTownContent()).isUnlocked();
		},

		/**
		 * Get a list of dream orbs owned by the player.
		 *
		 * @return {Object[]} - List of objects for each Dream Orb owned.
		 *                      Each object should contain the values:
		 *                      - "name":   String - the name of the orb type/colour.
		 *                      - "amount": number - The amount the player owns.
		 */
		getDreamOrbs() {
			return App.game.dreamOrbController.orbs
				.map(o => ({
					name: o.color,
					amount: o.amount(),
				}))
				.filter(o => o.amount > 0);
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

		const fullSeconds = ms / 1000;
		if (fullSeconds < 60) {
			return `${fullSeconds.toPrecision(2)} seconds`;
		}

		const fullMinutes = Math.floor(fullSeconds / 60);
		const seconds = fullSeconds - fullMinutes * 60;
		if (fullMinutes < 10) {
			return `${fullMinutes} minutes, ${seconds.toFixed(0)} seconds`
		}

		return `${fullMinutes.toFixed(0)} minutes`;
	}

	function printDreamOrbs() {
		if (!page.unlockedDreamOrbs()) {
			return;
		}

		const orbs = page.getDreamOrbs();
		console.log("You have",
			orbs.map(o =>
					`${o.amount} ${o.name} `
					+ (o.amount == 1? "orb" : "orbs"))
				.join(", "));
	}

	function tick() {
		const now = +new Date();
		const lastSave = +page.getLastSaveTime();

		if (now >= lastSave + MIN_TIME_SKIP
				&& now >= lastEarningsTrigger + EARNINGS_COOLDOWN) {
			page.triggerOfflineEarnings();
			console.log("Awarding offline earnings for " + timeDeltaStr(now - lastSave) + " time skip");
			printDreamOrbs();
			lastEarningsTrigger = now;
		}
	}

	(function main() {
		setInterval(tick, TICK_INTERVAL);
	})();
})();

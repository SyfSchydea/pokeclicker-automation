// ==UserScript==
// @name         Pokéclicker - Syf Scripts - Battle Frontier
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Completes the Battle Frontier automatically.
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

	const page = {
		/**
		 * Check if the player is currently at the Battle Frontier's town.
		 *
		 * @return - Truthy if at the Battle Frontier town. Falsey if not.
		 */
		atFrontierTown() {
			return player.town().name == "Battle Frontier";
		},

		/**
		 * Check if the player has entered the Battle Frontier.
		 *
		 * @return - Truthy if in the Battle Frontier. Falsey if not.
		 */
		inFrontier() {
			return App.game.gameState == GameConstants.GameState.battleFrontier;
		},

		/**
		 * Check if the player is currently battling in the Battle Frontier.
		 *
		 * @return - Truthy if currently battling in the Battle Frontier.
		 *           Falsey if not.
		 */
		frontierRunning() {
			return this.inFrontier() && BattleFrontierRunner.started();
		},

		/**
		 * Start battling in the Battle Frontier.
		 *
		 * @param resume {boolean} - True to continue from any checkpoint.
		 *                           False to restart from round 1.
		 */
		startFrontier(resume=true) {
			if (!this.inFrontier() || this.frontierRunning()) {
				return;
			}

			BattleFrontierRunner.start(resume);
		},

		/**
		 * Stop battling in the Battle Frontier.
		 */
		stopFrontier() {
			if (!this.frontierRunning()) {
				return;
			}

			BattleFrontierRunner.end();
		},
	};

	//////////////////////////

	/*
	 * The main functionality of the script should go here.
	 *
	 * Any interaction with the page should only be done
	 * through the page interface defined above.
	 */

	const WINDOW_KEY = "bf";

	const DELAY_DEFAULT    = 10 * 1000;
	const DELAY_TASK_START =      1000;

	let active = false;
	let tickTimeout = null;

	function scheduleTick(delay=DELAY_DEFAULT) {
		if (tickTimeout != null) {
			clearTimeout(tickTimeout);
		}

		setTimeout(tick, delay);
	}

	function tick() {
		if (!active) {
			return;
		}

		if (!page.atFrontierTown() || !page.inFrontier()) {
			active = false;
			return;
		}

		if (!page.frontierRunning()) {
			page.startFrontier();
		}

		scheduleTick();
	}

	function cmdStart() {
		if (!page.inFrontier()) {
			throw new Error("Must be at the Battle Frontier to start using it");
		}

		active = true;
		scheduleTick(DELAY_TASK_START);
		console.log("Starting to run the Battle Frontier");
	}

	function cmdStop() {
		page.stopFrontier();
		active = false;
		console.log("Stopping running the Battle Frontier");
	}

	(function main() {
		window[WINDOW_KEY] = {
			start: cmdStart,
			stop:  cmdStop,
		};
	})();
})();

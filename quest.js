// ==UserScript==
// @name         Pokeclicker - Auto Quester
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Completes quests automatically.
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
		 * Check if the game is loaded.
		 *
		 * @return - Truthy if the game has loaded, falsey if it hasn't yet.
		 */
		gameLoaded() {
			return App?.game;
		},

		/**
		 * Fetch the number of quests which the player currently has active.
		 * This includes quests which are in progress, and ones
		 * which are complete, but yet to be collected.
		 *
		 * @return {number} - Number of active quests.
		 */
		getActiveQuestCount() {
			throw new Error("TODO: implement me");
		},

		/**
		 * Check if the given active quest has been completed,
		 * and is waiting to be collected.
		 *
		 * @param questIdx {number} - Index of the active quest to query.
		 * @return                  - Truthy if the quest is completed,
		 *                            falsey if not.
		 */
		activeQuestCompleted(questIdx) {
			throw new Error("TODO: implement me");
		},

		/**
		 * Attempt to collect a completed quest.
		 *
		 * @param questIdx {number} - Index of the active quest to collect.
		 */
		collectQuest(questIdx) {
			throw new Error("TODO: implement me");
		},
	};

	//////////////////////////

	/*
	 * The main functionality of the script should go here.
	 *
	 * Any interaction with the page should only be done
	 * through the page interface defined above.
	 */

	const DELAY_INIT    =  5 * 1000;
	const DELAY_IDLE    = 10 * 1000;
	const DELAY_COLLECT =       500;

	function collectCompletedQuest() {
		const questCount = page.getActiveQuestCount();
		for (let i = 0; i < questCount; ++i) {
			if (page.activeQuestCompleted(i)) {
				page.collectQuest(i);
				return true;
			}
		}

		return false;
	}

	function tick() {
		if (!page.gameLoaded()) {
			return setTimeout(tick, DELAY_IDLE);
		}

		// TODO: Add setting if quests should be auto-completed. False by default
		if (collectCompletedQuest()) {
			return setTimeout(tick, DELAY_COLLECT);
		}

		setTimout(tick, DELAY_IDLE);
	}

	(function main() {
		setTimeout(tick, DELAY_INIT);
	})();
})();

// ==UserScript==
// @name         Pokeclicker - Auto Quester
// @namespace    http://tampermonkey.net/
// @version      0.4
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
		 * Fetch the save key of the currently loaded save.
		 *
		 * @return {string} - Save key if currently logged in, or an empty string if not.
		 */
		getSaveKey() {
			return Save.key;
		},

		/**
		 * Fetch the number of quests which the player currently has active.
		 * This includes quests which are in progress, and ones
		 * which are complete, but yet to be collected.
		 *
		 * @return {number} - Number of active quests.
		 */
		getActiveQuestCount() {
			return App.game.quests.currentQuests().length;
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
			return App.game.quests.currentQuests()[questIdx].isCompleted();
		},

		/**
		 * Attempt to collect a completed quest.
		 *
		 * @param questIdx {number} - Index of the active quest to collect.
		 */
		collectQuest(questIdx) {
			return App.game.quests.currentQuests()[questIdx].claim();
		},
	};

	//////////////////////////

	/*
	 * The main functionality of the script should go here.
	 *
	 * Any interaction with the page should only be done
	 * through the page interface defined above.
	 */

	const WINDOW_KEY = "autoQuest";

	const DELAY_INIT    =  5 * 1000;
	const DELAY_IDLE    = 10 * 1000;
	const DELAY_COLLECT =       500;

	// TODO: Can this be moved to some kind of library file?
		// This is some code duplication from breeder.js
	const SETTINGS_SCOPE_SAVE = {storage: localStorage,
			getKey: () => "syfschydea--quest--settings--" + page.getSaveKey()};

	/**
	 * Holds info about a single value which exists in settings.
	 */
	class Setting {
		constructor(scope, key, defaultVal) {
			this.scope = scope;
			this.key = key;
			this.defaultVal = defaultVal;
		}

		_read() {
			const settingsJson = this.scope.storage.getItem(
					this.scope.getKey());

			if (!settingsJson) {
				return {};
			}

			return JSON.parse(settingsJSON);
		}

		get() {
			const settings = this._read();

			if (!(this.key in settings)) {
				return this.defaultVal;
			}

			return settings[this.key];
		}

		set(val) {
			const settings = this._read();
			settings[this.key] = val;
			this.scope.storage.setItem(this.scope.getKey(),
					JSON.stringify(settings);
		}
	}

	Setting.collectQuests = new Setting(SETTINGS_SCOPE_SAVE, "collect", false);

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

		if (Setting.collect.get() && collectCompletedQuest()) {
			return setTimeout(tick, DELAY_COLLECT);
		}

		setTimout(tick, DELAY_IDLE);
	}

	/**
	 * User-facing command.
	 * Set if the script should collect completed quests automatically or not.
	 *
	 * @param collect - Truthy to collect quests, falsey to not.
	 */
	function cmdSetCollect(collect=true) {
		Setting.collect.set(!!collect);
		console.log((collect? "Started" : "Stopped"), "collecting completed quests");
	}

	function exposeCommands() {
		window[WINDOW_KEY] = {
			collectQuests: cmdSetCollect,
		};
	}

	(function main() {
		setTimeout(tick, DELAY_INIT);
		exposeCommands();
	})();
})();

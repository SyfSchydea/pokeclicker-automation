// ==UserScript==
// @name         Pokeclicker - Auto Login
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Automatically re-logs in, if you refresh
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
		 * Fetch the save key of the currently loaded save.
		 *
		 * @return {string} - Save key if currently logged in, or an empty string if not.
		 */
		getSaveKey() {
			return Save.key;
		},

		/**
		 * While on the Save Selector menu, load the save with the given key.
		 *
		 * @param key {string} - Save key to load.
		 */
		loadSave(key) {
			const card = document.querySelector(`.trainer-card[data-key='${key}']`);
			if (!card) {
				throw new Error("Failed to find trainer card for key " + key);
			}

			card.click();
		},

		/**
		 * Check if the Save Selector menu is currently open.
		 *
		 * @return - Truthy if the Save Selector menu is open, or falsey if not.
		 */
		isSaveSelectorOpen() {
			return document.querySelector("#saveSelector") && document.querySelector(".trainer-card");
		},

		/**
		 * Fetch data for the current save.
		 * Will cause an auto-save of the main game as a side-effect.
		 *
		 * @return - JSON-encodable value containing information about the current save.
		 */
		getCurrentSave() {
			Save.store(player);

			const key = Save.key;
			const playerData = JSON.parse(localStorage.getItem("player"   + key));
			const save       = JSON.parse(localStorage.getItem("save"     + key));
			const settings   = JSON.parse(localStorage.getItem("settings" + key));

			return {
				key,
				player: playerData,
				save,
				settings,
			};
		},

		/**
		 * Load a previously stored save back into the game.
		 * Will not replace and actively running game,
		 * but only modify the game's saves to then load them from the Save Selector.
		 *
		 * @param save      - Data about the game save, in the same format as returned by page.getCurrentSave().
		 * @return {string} - The save.key, which this save was written to.
		 */
		restoreSave(save) {
			localStorage.setItem("player"   + save.key, JSON.stringify(save.player));
			localStorage.setItem("save"     + save.key, JSON.stringify(save.save));
			localStorage.setItem("settings" + save.key, JSON.stringify(save.settings));

			return save.key;
		},
	};

	//////////////////////////

	/*
	 * The main functionality of the script should go here.
	 *
	 * Any interaction with the page should only be done
	 * through the page interface defined above.
	 */

	const KEY_PREFIX = "syfschydea--auto-login--";
	const SSKEY_SAVE_KEY     = KEY_PREFIX + "save-key";
	const SSKEY_SAVE_STATE   = KEY_PREFIX + "save-state--";
	const SSKEY_NEXT_LOAD_ID = KEY_PREFIX + "next-load-id";

	const DELAY_LOGIN =       500;
	const DELAY_WAIT  = 30 * 1000;

	function tick() {
		let cachedKey = sessionStorage.getItem(SSKEY_SAVE_KEY);

		if (page.isSaveSelectorOpen()) {
			const stateToLoad = sessionStorage.getItem(SSKEY_NEXT_LOAD_ID);
			if (stateToLoad != null) {
				const stateJson = sessionStorage.getItem(SSKEY_SAVE_STATE + stateToLoad);
				const state = JSON.parse(stateJson);
				cachedKey = page.restoreSave(state);

				sessionStorage.removeItem(SSKEY_NEXT_LOAD_ID);
			}

			if (cachedKey != null) {
				page.loadSave(cachedKey);
				return;
			}
		} else {
			const key = page.getSaveKey();
			if (key != "") {
				sessionStorage.setItem(SSKEY_SAVE_KEY, key);
				return;
			}
		}

		const wait = cachedKey? DELAY_LOGIN : DELAY_WAIT;
		setTimeout(tick, wait);
	}

	/**
	 * Exported Function.
	 * Stores the current state of the game into sessionStorage.
	 *
	 * @param saveId {string} - Identifier used to reference this save later.
	 */
	function saveState(saveId) {
		const save = page.getCurrentSave();
		sessionStorage.setItem(SSKEY_SAVE_STATE + saveId, JSON.stringify(save));
	}

	/**
	 * Exported Function.
	 * Loads a previously saved game state.
	 * Will reload the page to achieve this.
	 *
	 * @param saveId {string} - Identifier of state to load.
	 */
	function loadState(saveId) {
		if (sessionStorage.getItem(SSKEY_SAVE_STATE + saveId) == null) {
			throw new Error(`Save '${saveId}' not found`);
		}

		sessionStorage.setItem(SSKEY_NEXT_LOAD_ID, saveId);
		location.reload();
	}

	function exposeFunctions() {
		if (!window.syfScripts) {
			window.syfScripts = {};
		}

		window.syfScripts.saveManager = {
			saveState,
			loadState,
		};
	}

	(function main() {
		exposeFunctions();
		tick();
	})();
})();

// ==UserScript==
// @name         Pokeclicker - Auto Login
// @namespace    http://tampermonkey.net/
// @version      1.0
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
	};

	//////////////////////////

	/*
	 * The main functionality of the script should go here.
	 *
	 * Any interaction with the page should only be done
	 * through the page interface defined above.
	 */

	const KEY_PREFIX = "syfschydea--auto-login--";
	const SSKEY_SAVE_KEY = KEY_PREFIX + "save-key";

	const DELAY_LOGIN =       500;
	const DELAY_WAIT  = 30 * 1000;

	function tick() {
		let key = sessionStorage.getItem(SSKEY_SAVE_KEY);
		if (key != null) {
			page.loadSave(key);
			return;
		}

		key = page.getSaveKey();
		if (key != "") {
			sessionStorage.setItem(SSKEY_SAVE_KEY, key);
			return;
		}

		setTimeout(tick, DELAY_WAIT);
	}

	(function main() {
		tick();
	})();
})();

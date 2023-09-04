// ==UserScript==
// @name         Pokeclicker - Auto Login
// @namespace    http://tampermonkey.net/
// @version      1.4
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
		 * Test if the game has loaded.
		 *
		 * @return - Truthy if the game has loaded, false otherwise.
		 */
		gameLoaded() {
			return App.game;
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

		/**
		 * Find the normalised name of a pokemon.
		 * Allows for some user error on things such as capitalisation.
		 *
		 * @param name {string} - User-entered name of a pokemon.
		 * @return     {string} - Correctly spelled, capitalised form of the name,
		 *                        or null if the pokemon can't be found.
		 */
		normalisePokemonName(name) {
			const normName = PokemonHelper.getPokemonByName(name).name;
			if (normName == "MissingNo.") {
				return null;
			}

			return normName;
		},

		/**
		 * Verify that the given pokemon is available from a shop in the current town.
		 *
		 * @param name {string} - Normalised name of pokemon to search for.
		 * @return              - Truthy if the pokemon can be bought here, falsey if not.
		 */
		findPokemonInShop(name) {
			for (const townContent of player.town().content) {
				if (!(townContent instanceof Shop)) {
					continue;
				}

				for (const item of townContent.items) {
					if (item instanceof PokemonItem && item.name == name
							&& item.isAvailable()) {
						return true;
					}
				}
			}

			return false;
		},

		/**
		 * Attempt to buy the given pokemon as an item.
		 *
		 * @param name {string} - Name of the pokemon to buy.
		 */
		buyPokemon(name) {
			const item = ItemList[name];
			if (!item || !(item instanceof PokemonItem)) {
				throw new Error("Failed to find pokemon item for " + name);
			}

			item.buy(1);
		},

		/**
		 * Check if the player has caught a shiny of the specified species.
		 *
		 * @param name {string} - Name of the pokemon to look up.
		 * @return              - Truthy if the player has that shiny, falsey if not.
		 */
		hasShiny(name) {
			return App.game.party.alreadyCaughtPokemonByName(name, true);
		},
	};

	//////////////////////////

	/*
	 * The main functionality of the script should go here.
	 *
	 * Any interaction with the page should only be done
	 * through the page interface defined above.
	 */

	// Window key for misc save-scum grind user-facing functions
	const GRIND_WINDOW_KEY = "grind";

	const KEY_PREFIX = "syfschydea--auto-login--";
	const SSKEY_SAVE_KEY     = KEY_PREFIX + "save-key";
	const SSKEY_SAVE_STATE   = KEY_PREFIX + "save-state--";
	const SSKEY_NEXT_LOAD_ID = KEY_PREFIX + "next-load-id";

	// Name of pokemon we're trying to buy shiny
	const SSKEY_BUY_SHINY_SETTINGS = KEY_PREFIX + "buy-shiny-settings";

	const SAVEID_BUY_SHINY = "auto-save--buy-shiny";

	const DELAY_LOGIN     =      500;
	const DELAY_WAIT      = 5 * 1000;

	const DELAY_START_CMD =     1000;
	const DELAY_BUY       =     1000;

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

	// Number of pokemon bought for the buyShiny process
	let pkmnBought = 0;

	function buyShinyTick() {
		const settingsJson = sessionStorage.getItem(SSKEY_BUY_SHINY_SETTINGS);
		if (!settingsJson) {
			return;
		}

		const settings = JSON.parse(settingsJson);

		if (!page.gameLoaded()) {
			return setTimeout(buyShinyTick, DELAY_WAIT);
		}

		if (page.hasShiny(settings.pkmn)) {
			console.log("Obtained shiny", settings.pkmn);
			sessionStorage.removeItem(SSKEY_BUY_SHINY_SETTINGS);
			return;
		}

		// Double check that we can still access the pokemon
		if (!page.findPokemonInShop(settings.pkmn)) {
			console.error(`Failed to find ${settings.pkmn} in a shop at your current location`);
			return;
		}

		// If already attempted to buy, load state
		if (pkmnBought >= settings.count) {
			loadState(SAVEID_BUY_SHINY);
			return;
		}

		page.buyPokemon(settings.pkmn);
		pkmnBought += 1;
		return setTimeout(buyShinyTick, DELAY_BUY);
	}

	/**
	 * User-facing command.
	 * Begin save-scumming for the given shop-bought shiny.
	 * Should be run when at the town which has the shop you want to buy from.
	 *
	 * Takes an optional param of count.
	 * The script will buy this many of the pokemon before reloading.
	 */
	function cmdBuyShiny(pkmnName, count=1) {
		// Check that the pokemon exists
		const normName = page.normalisePokemonName(pkmnName);
		if (!normName) {
			throw new Error(`Couldn't find pokemon "${pkmnName}"`);
		}

		// Check that we can access this pokemon
		if (!page.findPokemonInShop(normName)) {
			throw new Error(`Failed to find ${normName} in a shop at your current location`);
		}

		if (typeof(count) != "number") {
			throw new Error("count must be a number");
		}

		// Start the grind process
		saveState(SAVEID_BUY_SHINY);

		const settings = JSON.stringify({pkmn: normName, count});
		sessionStorage.setItem(SSKEY_BUY_SHINY_SETTINGS, settings);

		setTimeout(buyShinyTick, DELAY_START_CMD);
	}

	function exposeFunctions() {
		if (!window.syfScripts) {
			window.syfScripts = {};
		}

		window.syfScripts.saveManager = {
			saveState,
			loadState,
		};

		window[GRIND_WINDOW_KEY] = {
			buyShiny: cmdBuyShiny,
		};
	}

	(function main() {
		exposeFunctions();
		tick();
		setTimeout(buyShinyTick, DELAY_START_CMD);
	})();
})();

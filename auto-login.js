// ==UserScript==
// @name         Pokeclicker - Auto Login
// @namespace    http://tampermonkey.net/
// @version      1.7.3
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
			for (const townContent of player.town.content) {
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
		 * Check if the player has caught the specified species.
		 *
		 * @param name {string} - Name of the pokemon to look up.
		 * @return              - Truthy if the player has that pokemon, falsey if not.
		 */
		hasPokemon(name) {
			return App.game.party.alreadyCaughtPokemonByName(name);
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

		/**
		 * Check that the given item name is a real evolution stone,
		 * and that the player has at least one.
		 *
		 * @param name {string} - Item name to look up.
		 * @return              - Truthy if the item is an evolution stone which the player owns.
		 *                        Falsey if not.
		 */
		hasStone(name) {
			return (ItemList[name] instanceof EvolutionStone
					&& player.itemList[name]?.() > 0);
		},

		/**
		 * Check if the given stone can be used on the given pokemon,
		 * and what pokemon can be produced if so.
		 *
		 * Note: This does not account for more than one evolution resulting from the same stone on the same pokemon.
		 * I'm not sure if this is something that actually shows up in the game,
		 * but if it does, it'll only return one of the evolutions.
		 *
		 * @param pkmn  {string}      - Name of the pokemon to test.
		 * @param stone {string}      - Name of the stone to use on that pokemon.
		 * @return      {string|null} - Name of the pokemon produced by using the stone,
		 *                              or null if the stone can't make the original pokemon evolve.
		 */
		getStoneEvolution(pkmn, stone) {
			const pkmnData = PokemonHelper.getPokemonByName(pkmn);
			if (!pkmnData) {
				throw new Error(`Failed to find "${pkmn}"`);
			}

			if (!pkmnData.evolutions) {
				return null;
			}

			const stoneData = ItemList[stone];
			if (!stoneData || !(stoneData instanceof EvolutionStone)) {
				throw new Error(`"${stone}" is not a known evolution item`);
			}

			for (let i = 0; i < pkmnData.evolutions.length; ++i) {
				const evo = pkmnData.evolutions[i];

				if (evo.trigger == EvoTrigger.STONE
						&& evo.stone == stoneData.type
						&& EvolutionHandler.isSatisfied(evo)) {
					return evo.evolvedPokemon;
				}
			}

			return null;
		},

		/**
		 * Attempt to use the given evolution stone on the given pokemon.
		 *
		 * @param pkmn  {string} - Name of the pokemon to evolve.
		 * @param stone {string} - Name of the stone to use on that pokemon.
		 */
		useEvolutionStone(pkmn, stone) {
			const stoneData = ItemList[stone];
			if (!stoneData || !(stoneData instanceof EvolutionStone)) {
				throw new Error(`"${stone}" is not a known evolution item`);
			}

			ItemHandler.stoneSelected(stone);
			ItemHandler.pokemonSelected(pkmn);
			ItemHandler.amountSelected(1);
			ItemHandler.useStones();
		},

		/**
		 * Find a temporary battle which allows the player to capture the given pokemon.
		 * Should only return battles which the player has unlocked and has access to now.
		 *
		 * @param pkmn {string}      - Name of the pokemon to look up.
		 * @return     {string|null} - Id of the temporary battle, or null if no battle is found.
		 */
		findTempBattle(pkmn) {
			for (const [id, battle] of Object.entries(TemporaryBattleList)) {
				if (battle.optionalArgs.isTrainerBattle || !battle.isVisible()) {
					continue;
				}

				for (const battleMon of battle.pokemons) {
					if (battleMon.name == pkmn) {
						return id;
					}
				}
			}

			return null;
		},

		/**
		 * Attempt to enter the given temporary battle.
		 *
		 * @param battleName {string} - Name of temporary battle to enter.
		 */
		enterTempBattle(battleName) {
			const battle = TemporaryBattleList[battleName];

			if (!battle.parent || (battle.parent.region == player.region
					&& battle.parent.subregion == player.subregion)) {
				battle.protectedOnclick();
			}
		},

		/**
		 * Find the id of the region which holds the given temporary battle.
		 *
		 * @param battleName {string} - Name of temporary battle to look up.
		 * @return           {number} - Id of the region this battle is in.
		 */
		getTempBattleRegion(battleName) {
			return TemporaryBattleList[battleName].parent?.region;
		},

		/**
		 * Find the id of the subregion which holds the given temporary battle.
		 *
		 * @param battleName {string} - Name of temporary battle to look up.
		 * @return           {number} - Id of the subregion this battle is in.
		 */
		getTempBattleSubRegion(battleName) {
			return TemporaryBattleList[battleName].parent?.subregion;
		},

		/**
		 * Find the id of the region which the player is in.
		 *
		 * @return {number} - Id of the region the player is in.
		 */
		getPlayerRegion(battleName) {
			return player.region;
		},

		/**
		 * Find the id of the subregion which the player is in.
		 *
		 * @return {number} - Id of the subregion the player is in.
		 */
		getPlayerSubRegion(battleName) {
			return player.subregion;
		},

		/**
		 * Check if we're currently in a battle with a shiny pokemon.
		 *
		 * @return - Truthy if in a battle with a shiny, falsey if not.
		 */
		battlingShiny() {
			return Battle.enemyPokemon()?.shiny;
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

	const SSKEY_BUY_SHINY_SETTINGS = KEY_PREFIX + "buy-shiny-settings";
	const SSKEY_EVO_STONE_SETTINGS = KEY_PREFIX + "evo-stone-settings";

	const SAVEID_BUY_SHINY = "auto-save--buy-shiny";
	const SAVEID_EVO_STONE = "auto-save--evo-stone";

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

	function evoStoneTick() {
		const settingsJson = sessionStorage.getItem(SSKEY_EVO_STONE_SETTINGS);
		if (!settingsJson) {
			return;
		}

		if (!page.gameLoaded()) {
			return setTimeout(evoStoneTick, DELAY_WAIT);
		}

		const settings = JSON.parse(settingsJson);

		if (page.hasShiny(settings.targetPkmn)) {
			console.log("Got a shiny", settings.targetPkmn,
					"after", settings.attempts,
					(settings.attempts == 1? "attempt!" : "attempts!"));
			sessionStorage.removeItem(SSKEY_EVO_STONE_SETTINGS);
			return;
		}

		// Check if we still have the pokemon and the stone
		if (!page.hasStone(settings.stone) || !page.hasPokemon(settings.basePkmn)) {
			loadState(SAVEID_EVO_STONE);
			return;
		}

		// Use the stone on the pokemon
		page.useEvolutionStone(settings.basePkmn, settings.stone);

		settings.attempts += 1;
		sessionStorage.setItem(SSKEY_EVO_STONE_SETTINGS,
				JSON.stringify(settings));

		return setTimeout(evoStoneTick, DELAY_BUY);
	}

	/**
	 * User-facing command.
	 * Start save-scumming for a shiny from an evolution stone.
	 */
	function cmdEvoStone(basePokemon, stone) {
		// Normalise stone name to have correct capitalisation, and convert spaces to underscores
		let stoneName = stone.trim().replace(/ +/g, "_");
		stoneName = stoneName[0].toUpperCase() + stoneName.slice(1).toLowerCase();

		if (!page.hasStone(stoneName)) {
			throw new Error("You do not have any " + stone);
		}

		// Check that the pokemon exists
		const basePkmnName = page.normalisePokemonName(basePokemon);
		if (!basePkmnName) {
			throw new Error(`Couldn't find pokemon "${basePokemon}"`);
		}

		if (!page.hasPokemon(basePkmnName)) {
			throw new Error("You don't have a " + basePkmnName);
		}

		// Check that the stone can be used to evolve the pokemon
		const resultingPkmn = page.getStoneEvolution(basePkmnName, stoneName);
		if (!resultingPkmn) {
			throw new Error(`${stoneName} can't be used on ${basePkmnName}`);
		}

		saveState(SAVEID_EVO_STONE);

		const settings = JSON.stringify({
			basePkmn:   basePkmnName,
			targetPkmn: resultingPkmn,
			stone:      stoneName,

			attempts:   0,
		});
		sessionStorage.setItem(SSKEY_EVO_STONE_SETTINGS, settings);

		setTimeout(evoStoneTick, DELAY_START_CMD);

		console.log("Trying to get a shiny", resultingPkmn,
				"from using a", stoneName, "on", basePkmnName);
	}

	function validateBattleRegion(battleName) {
		const region = page.getTempBattleRegion(battleName);
		if (region != null && region != page.getPlayerRegion()) {
			return false;
		}

		const subregion = page.getTempBattleSubRegion(battleName);
		if (subregion != null && subregion != page.getPlayerSubRegion()) {
			return false;
		}

		return true;
	}

	let tempBattleShiny = null;
	let inShinyTempBattle = false;

	function tempShinyTick() {
		if (page.hasShiny(tempBattleShiny)) {
			console.log("Caught it!");
			tempBattleShiny = null;
			return;
		}

		if (page.battlingShiny()) {
			if (!inShinyTempBattle) {
				console.log("Found a shiny...");
				inShinyTempBattle = true;
			}

			return setTimeout(tempShinyTick, DELAY_WAIT);
		} else {
			inShinyTempBattle = false;
		}

		const battleName = page.findTempBattle(tempBattleShiny);
		if (!battleName || !validateBattleRegion(battleName)) {
			console.error("Failed to find valid temporary battle");
			tempBattleShiny = null;
			return;
		}

		page.enterTempBattle(battleName);
		setTimeout(tempShinyTick, DELAY_BUY);
	}

	function cmdTempShiny(pkmnName) {
		const pkmn = page.normalisePokemonName(pkmnName);
		if (!pkmn) {
			throw new Error(`Failed to find pokemon '${pkmnName}'`);
		}

		if (page.hasShiny(pkmn)) {
			throw new Error("You've already caught a shiny " + pkmn);
		}

		const battleName = page.findTempBattle(pkmn);
		if (!battleName) {
			throw new Error("Failed to find battle for " + pkmn);
		}

		if (!validateBattleRegion(battleName)) {
			throw new Error("You're not in the right region to fight " + pkmn);
		}

		tempBattleShiny = pkmn;
		setTimeout(tempShinyTick, DELAY_START_CMD);
		console.log("Grinding temporary battles for a shiny", pkmn);
	}

	function exposeFunctions() {
		if (!window.syfScripts) {
			window.syfScripts = {};
		}

		window.syfScripts.saveManager = {
			saveState,
			loadState,
		};

		if (!window[GRIND_WINDOW_KEY]) {
			window[GRIND_WINDOW_KEY] = {};
		}

		window[GRIND_WINDOW_KEY].buyShiny        = cmdBuyShiny;
		window[GRIND_WINDOW_KEY].evoStoneShiny   = cmdEvoStone;
		window[GRIND_WINDOW_KEY].tempBattleShiny = cmdTempShiny;
	}

	(function main() {
		exposeFunctions();
		tick();
		setTimeout(buyShinyTick, DELAY_START_CMD);
		setTimeout(evoStoneTick, DELAY_START_CMD);
	})();
})();

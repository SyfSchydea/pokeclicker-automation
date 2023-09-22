// ==UserScript==
// @name         Pokeclicker - Auto Quester
// @namespace    http://tampermonkey.net/
// @version      0.10.1+active-pokeballs
// @description  Completes quests automatically.
// @author       SyfP
// @match        https://www.tampermonkey.net
// @grant        none
// ==/UserScript==

(() => {
	"use strict";

	// Enum for types of quests encountered
	const QuestType = {
		BERRY:          "berry",
		CATCH_POKEMON:  "catch",
		CATCH_SHINIES:  "shiny",
		DUNGEON_TOKENS: "dungeon tokens",
		FARM_POINTS:    "farm points",
		MINE_ITEMS:     "mine items",
		MINE_LAYERS:    "mine layers",
		POKEDOLLARS:    "pokedollars",

		// Any quest types not yet handled by the script
		UNKNOWN: "unknown",
	};

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
		 * Get the number of quests currently in the quest list.
		 *
		 * @return {number} - Number of quests active.
		 */
		getQuestCount() {
			return App.game.quests.questList().length;
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
		 * @param activeQuestIdx {number} - Index of the active quest to query.
		 * @return                        - Truthy if the quest is completed,
		 *                                  falsey if not.
		 */
		activeQuestCompleted(activeQuestIdx) {
			return App.game.quests.currentQuests()[activeQuestIdx].isCompleted();
		},

		/**
		 * Convert an active quest index to a quest list index.
		 *
		 * @param activeQuestIdx {number} - Index of quest to look up in the list of active quests.
		 * @return               {number} - Index of the same quest in the full list of quests.
		 */
		activeQuestIdxToQuestIdx(activeQuestIdx) {
			return App.game.quests.currentQuests()[activeQuestIdx].index;
		},

		/**
		 * Attempt to collect a completed quest.
		 *
		 * @param activeQuestIdx {number} - Index of the active quest to collect.
		 */
		collectActiveQuest(activeQuestIdx) {
			const questIdx = this.activeQuestIdxToQuestIdx(activeQuestIdx);
			App.game.quests.claimQuest(questIdx);
		},

		/**
		 * Not required by interface.
		 * Fetch the given quest object from the quest list.
		 *
		 * @param questIdx {number} - Index of the quest to look up in the quest list.
		 * @return         {Quest}  - Quest object for this quest.
		 */
		_getQuest(questIdx) {
			return App.game.quests.questList()[questIdx];
		},

		/**
		 * Look up details about the given quest from the list.
		 * Returns an object containing at least a 'type' property.
		 *
		 * @param questIdx {number} - Index of the quest to look up in the quest list.
		 * @return         {Object} - Object containing information about the quest.
		 */
		getQuestInfo(questIdx) {
			const quest = this._getQuest(questIdx);

			switch (quest.constructor) {
				case HarvestBerriesQuest:
					return {
						type: QuestType.BERRY,
						berry: BerryType[quest.berryType],
					};

				case GainFarmPointsQuest:
					return {type: QuestType.FARM_POINTS};

				case GainMoneyQuest:
					return {type: QuestType.POKEDOLLARS};

				case MineItemsQuest:
					return {type: QuestType.MINE_ITEMS};

				case MineLayersQuest:
					return {type: QuestType.MINE_LAYERS};

				case GainTokensQuest:
					return {type: QuestType.DUNGEON_TOKENS};

				case CapturePokemonsQuest:
					return {type: QuestType.CATCH_POKEMON};

				case CatchShiniesQuest:
					return {type: QuestType.CATCH_SHINIES};

				default:
					return {type: QuestType.UNKNOWN};
			}
		},

		/**
		 * Attempt to start the given quest.
		 *
		 * @param questIdx {number} - Index of the quest to start.
		 */
		startQuest(questIdx) {
			App.game.quests.beginQuest(questIdx);
		},

		/**
		 * Check if the player can start any new quest.
		 *
		 * @return - Truthy if the player can start new quests. Falsey if not.
		 */
		canStartNewQuests() {
			return App.game.quests.canStartNewQuest();
		},

		/**
		 * Check if the given quest is eligible to be started.
		 *
		 * Note that this does not check if the player is able to start new quests in general.
		 * Please use page.canStartNewQuests() for this.
		 *
		 * @param questIdx {number} - Index of the quest to look up in the quest list.
		 * @return                  - Truthy if the player can this quest. Falsey if not.
		 */
		canStartQuest(questIdx) {
			const quest = this._getQuest(questIdx);
			return !quest.inProgress() && !quest.isCompleted();
		},

		/**
		 * Not required by interface.
		 * Check if the specified encounter type will be caught by the player's current pokeball filter settings.
		 *
		 * @param encounterData {Object} - Details of the encounter type to query.
		 * @return                       - Truthy if this encounter will be caught, falsey if not.
		 */
		_queryPokeballSettings(encounterData) {
			const filter = App.game.pokeballFilters.findMatch(encounterData);
			if (!filter) {
				return false;
			}

			const pokeballType = filter.ball();
			return (pokeballType != GameConstants.Pokeball.None
				&& App.game.pokeballs.pokeballs[pokeballType].quantity() > 0);
		},

		// Definition of a regular route encounter
		_regularEncounter: {
			encounterType: "Route",
			pokemonType:[
				PokemonType.None,
				PokemonType.None,
			],
			shiny: false,
			shadow: false,
			pokerus: GameConstants.Pokerus.Uninfected,
			caught: true,
			caughtShiny: true,
			caughtShadow: true,
		},

		/**
		 * Check if the current pokeball settings will catch a shiny.
		 *
		 * @return - Truthy if the player's current pokeball filter settings
		 *           will catch shinies, falsey otherwise.
		 */
		willCatchShiny() {
			return this._queryPokeballSettings({
				encounterType: "Route",
				pokemonType:[
					PokemonType.None,
					PokemonType.None,
				],
				shiny: true,
				shadow: false,
				pokerus: GameConstants.Pokerus.Uninfected,
				caught: true,
				caughtShiny: true,
				caughtShadow: true,
			});
		},

		/**
		 * Check if the current pokeball settings will catch typical pokemon encounters.
		 *
		 * @return - Truthy if the player's current pokeball filter settings
		 *           will catch standard non-shiny pokemon encounters.
		 */
		willCatchPokemon() {
			return this._queryPokeballSettings(this._regularEncounter);
		},

		/**
		 * Find the index of the pokeball filter which will match a regular pokemon encounter.
		 *
		 * @return {number} - Index of the filter which matches a typical route encounter, or -1 if none match.
		 */
		getRegularPokemonFilterIndex() {
			const filter = App.game.pokeballFilters.findMatch(this._regularEncounter);
			return App.game.pokeballFilters.list.indexOf(filter);
		},

		/**
		 * Fetch the total number of pokeball filters in the list.
		 *
		 * @return {number} - Number of filters in the list.
		 */
		getTotalFilterCount() {
			return App.game.pokeballFilters.list().length;
		},

		/**
		 * Find the UUID of the nth pokeball filter in the list.
		 *
		 * @param index {number} - Position of the specified filter in the list.
		 * @return      {string} - UUID of the filter.
		 */
		filterIndexToUuid(index) {
			return App.game.pokeballFilters.list()[index].uuid;
		},

		/**
		 * Create a new pokeball filter in the specified position in the list, and return its UUID.
		 *
		 * @param index {number} - Position in the list it should be inserted.
		 * @return      {string} - UUID of the newly created filter.
		 */
		createPokeballFilter(index) {
			App.game.pokeballFilters.createFilter();
			const filter = App.game.pokeballFilters.list()[0];

			if (filter.name != "New Filter") {
				throw new Error(`Unexpected new filter name: '${filter.name}'`);
			}

			App.game.pokeballFilters.list.remove(filter);
			App.game.pokeballFilters.list.splice(index, 0, filter);

			return filter.uuid;
		},

		/**
		 * Remove the specified pokeball filter from the list.
		 *
		 * @param uuid {string} - UUID of the filter to remove.
		 */
		deleteFilter(uuid) {
			App.game.pokeballFilters.list.remove(this._getFilter(uuid));
		},

		/**
		 * Not required by interface.
		 * Fetch the pokeball filter with the given UUID.
		 * Will throw an error if the filter cannot be found.
		 *
		 * @param uuid {string}         - UUID of the filter to find.
		 * @return     {PokeballFilter} - Matching filter object.
		 */
		_getFilter(uuid) {
			const list = App.game.pokeballFilters.list();
			for (let i = 0; i < list.length; ++i) {
				const filter = list[i];

				if (filter.uuid == uuid) {
					return filter;
				}
			}

			throw new Error("Failed to find filter " + uuid);
		},

		/**
		 * Find the name of the specified filter.
		 *
		 * @param uuid {string} - UUID of the filter to look up.
		 * @return     {string} - Name of the filter.
		 */
		getFilterName(uuid) {
			return this._getFilter(uuid).name;
		},

		/**
		 * Set the name of a pokeball filter.
		 *
		 * @param uuid {string} - UUID of the filter to modify.
		 * @param name {string} - Name to give to this filter.
		 */
		setFilterName(uuid, name) {
			this._getFilter(uuid).name = name;
		},

		/**
		 * Add an option to the given pokeball filter.
		 *
		 * @param uuid  {string}  - UUID of the filter to modify.
		 * @param key   {string}  - Option name to add.
		 * @param value {boolean} - Option value to set.
		 */
		addFilterOption(uuid, key, value) {
			const filter = this._getFilter(uuid);
			App.game.pokeballFilters.addFilterOption(filter, key);
			filter.options[key].observableValue(value);
		},
	};

	//////////////////////////

	/*
	 * The main functionality of the script should go here.
	 *
	 * Any interaction with the page should only be done
	 * through the page interface defined above.
	 */

	const WINDOW_KEY = "quest";

	const DELAY_INIT            =  5 * 1000;
	const DELAY_IDLE            = 10 * 1000;
	const DELAY_COLLECT         =       500;
	const DELAY_START_QUEST     =      1000;
	const DELAY_POKEBALL_FILTER =      1000;

	const POKEBALL_FILTER_REGULAR_NAME = "!syfQuest caught";

	// TODO: Can this be moved to some kind of library file?
		// This is some code duplication from breeder.js
	const SETTINGS_SCOPE_SAVE = {
		storage: localStorage,
		getKey: () => "syfschydea--quest--settings--" + page.getSaveKey(),
	};
	const SETTINGS_SCOPE_SESSION = {
		storage: sessionStorage,
		getKey: () => "syfschydea--quest--settings",
	};

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

			return JSON.parse(settingsJson);
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
					JSON.stringify(settings));
		}
	}

	Setting.collectQuests = new Setting(SETTINGS_SCOPE_SAVE, "collect", false);
	Setting.startQuests   = new Setting(SETTINGS_SCOPE_SAVE, "startQuests", false);

	Setting.modifyPokeballFilters = new Setting(SETTINGS_SCOPE_SESSION, "pokeballFilters", false);

	Setting.createdRegularFilter = new Setting(SETTINGS_SCOPE_SESSION, "hasRegularFilter", false);

	function collectCompletedQuest() {
		const questCount = page.getActiveQuestCount();
		for (let i = 0; i < questCount; ++i) {
			if (page.activeQuestCompleted(i)) {
				page.collectActiveQuest(i);
				return true;
			}
		}

		return false;
	}

	function questIsEligible(questIdx) {
		if (!page.canStartQuest(questIdx)) {
			return false;
		}

		const quest = page.getQuestInfo(questIdx);
		switch (quest.type) {
			case QuestType.POKEDOLLARS:
				return true;

			case QuestType.FARM_POINTS:
				return window.syfScripts?.farmHand?.canCompleteFarmPointQuest?.();

			case QuestType.BERRY:
				return window.syfScripts?.farmHand?.canCompleteBerryQuest?.(quest.berry);

			case QuestType.MINE_ITEMS:
				return window.syfScripts?.diggy?.canCompleteItemsQuest?.();

			case QuestType.MINE_LAYERS:
				return window.syfScripts?.diggy?.canCompleteLayersQuest?.();

			case QuestType.DUNGEON_TOKENS:
			case QuestType.CATCH_POKEMON:
				return (page.willCatchPokemon()
						|| Setting.modifyPokeballFilters.get());

			case QuestType.CATCH_SHINIES:
				return page.willCatchShiny();

			default:
				return false;
		}
	}

	function startEligibleQuest() {
		if (!page.canStartNewQuests()) {
			return false;
		}

		const questCount = page.getQuestCount();
		for (let i = 0; i < questCount; ++i) {
			if (questIsEligible(i)) {
				page.startQuest(i);
				return true;
			}
		}

		return false;
	}

	function addRegularPokemonFilter() {
		const filterIdx = page.getRegularPokemonFilterIndex() + 1;

		const filterUuid = page.createPokeballFilter(filterIdx);
		page.setFilterName(filterUuid, POKEBALL_FILTER_REGULAR_NAME);
		page.addFilterOption(filterUuid, "caught", true);

		Setting.createdRegularFilter.set(true);
	}

	function removeRegularPokeballFilters() {
		const matchingFilters = [];
		const totalFilterCount = page.getTotalFilterCount();
		for (let i = 0; i < totalFilterCount; ++i) {
			const uuid = page.filterIndexToUuid(i);
			if (page.getFilterName(uuid) == POKEBALL_FILTER_REGULAR_NAME) {
				matchingFilters.push(uuid);
			}
		}

		for (const uuid of matchingFilters) {
			page.deleteFilter(uuid);
		}

		Setting.createdRegularFilter.set(false);
	}

	function updatePokeballFilters() {
		let needRegularFilter = false;

		const questCount = page.getActiveQuestCount();
		for (let i = 0; i < questCount; ++i) {
			const qi = page.activeQuestIdxToQuestIdx(i);
			const quest = page.getQuestInfo(qi);

			switch (quest.type) {
				case QuestType.DUNGEON_TOKENS:
				case QuestType.CATCH_POKEMON:
					if (page.willCatchPokemon()) {
						needRegularFilter = true;
						continue;
					}

					addRegularPokemonFilter();
					return true;
			}
		}

		if (!needRegularFilter && Setting.createdRegularFilter.get()) {
			removeRegularPokeballFilters();
			return true;
		}

		return false;
	}

	function tick() {
		if (!page.gameLoaded()) {
			return setTimeout(tick, DELAY_IDLE);
		}

		if (Setting.modifyPokeballFilters.get() && updatePokeballFilters()) {
			return setTimeout(tick, DELAY_POKEBALL_FILTER);
		}

		if (Setting.collectQuests.get() && collectCompletedQuest()) {
			return setTimeout(tick, DELAY_COLLECT);
		}

		if (Setting.startQuests.get() && startEligibleQuest()) {
			return setTimeout(tick, DELAY_START_QUEST);
		}

		setTimeout(tick, DELAY_IDLE);
	}

	/**
	 * User-facing command.
	 * Set if the script should collect completed quests automatically or not.
	 *
	 * @param collect - Truthy to collect quests, falsey to not.
	 */
	function cmdSetCollect(collect=true) {
		Setting.collectQuests.set(!!collect);
		console.log((collect? "Started" : "Stopped"), "collecting completed quests");
	}

	/**
	 * User-facing command.
	 * Set if the script should start new quests automatically or not.
	 *
	 * @param startQuests - Truthy to start quests, falsey to not.
	 */
	function cmdSetStartQuests(startQuests=true) {
		Setting.startQuests.set(!!startQuests);
		console.log((startQuests? "Began" : "Stopped"), "starting eligible quests");
	}

	/**
	 * User-facing command.
	 * Set if the script should modify pokeball filters
	 * to actively complete quests or not.
	 *
	 * @param value - Truthy to modify pokeball filters, falsey to not.
	 */
	function cmdSetPokeballFilters(value=true) {
		Setting.modifyPokeballFilters.set(!!value);

		if (!value) {
			removeRegularPokeballFilters();
		}

		console.log((value? "Started" : "Stopped"), "modifying pokeball filters to complete quests");
	}

	function exposeCommands() {
		window[WINDOW_KEY] = {
			collectQuests: cmdSetCollect,
			startQuests:   cmdSetStartQuests,

			modifyPokeballFilters: cmdSetPokeballFilters,
		};
	}

	(function main() {
		setTimeout(tick, DELAY_INIT);
		exposeCommands();
	})();
})();

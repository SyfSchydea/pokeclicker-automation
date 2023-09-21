// ==UserScript==
// @name         Pokeclicker - Auto Quester
// @namespace    http://tampermonkey.net/
// @version      0.8+shiny-quest
// @description  Completes quests automatically.
// @author       SyfP
// @match        https://www.tampermonkey.net
// @grant        none
// ==/UserScript==

(() => {
	"use strict";

	// Enum for types of quests encountered
	const QuestType = {
		BERRY:       "berry",
		FARM_POINTS: "farm points",
		MINE_ITEMS:  "mine items",
		MINE_LAYERS: "mine layers",
		POKEDOLLARS: "pokedollars",
		SHINY:       "shiny",

		// Any quest types not yet handled by the script
		UNKNOWN:     "unknown",
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

				case CatchShiniesQuest:
					return {type: QuestType.SHINY};

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
		 * Check if the current pokeball settings will catch a shiny.
		 *
		 * @return - Truthy if the player's current pokeball filter settings
		 *           will catch shinies, falsey otherwise.
		 */
		willCatchShiny() {
			const filter = App.game.pokeballFilters.findMatch({
				encounterType: "Route",
				pokemonType:[
					PokemonType.None,
					PokemonType.None
				],
				shiny: true,
				shadow: false,
				pokerus: GameConstants.Pokerus.Uninfected,
				caught: true,
				caughtShiny: true,
				caughtShadow: true,
			});

			if (!filter) {
				return false;
			}

			const pokeballType = filter.ball();
			return (pokeballType != GameConstants.Pokeball.None
				&& App.game.pokeballs.pokeballs[pokeballType].quantity() > 0);
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

	const DELAY_INIT        =  5 * 1000;
	const DELAY_IDLE        = 10 * 1000;
	const DELAY_COLLECT     =       500;
	const DELAY_START_QUEST =      1000;

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

			case QuestType.SHINY:
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

	function tick() {
		if (!page.gameLoaded()) {
			return setTimeout(tick, DELAY_IDLE);
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

	function exposeCommands() {
		window[WINDOW_KEY] = {
			collectQuests: cmdSetCollect,
			startQuests:   cmdSetStartQuests,
		};
	}

	(function main() {
		setTimeout(tick, DELAY_INIT);
		exposeCommands();
	})();
})();

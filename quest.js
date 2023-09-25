// ==UserScript==
// @name         Pokeclicker - Auto Quester
// @namespace    http://tampermonkey.net/
// @version      0.19.5+active-catch-type
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
		CATCH_TYPED:    "catch typed",
		CLEAR_DUNGEON:  "clear dungeon",
		DUNGEON_TOKENS: "dungeon tokens",
		FARM_POINTS:    "farm points",
		GYM:            "gym",
		HATCH_EGGS:     "hatch eggs",
		MINE_ITEMS:     "mine items",
		MINE_LAYERS:    "mine layers",
		POKEDOLLARS:    "pokedollars",
		ROUTE_DEFEAT:   "route defeat",
		USE_POKEBALL:   "use pokeball",

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

	// Enum for pokemon encounter types
	const EncounterType = {
		REGULAR: "regular",
		SHINY:   "shiny",

		Typed: {}, // Populated dynamically
	};

	const page = {
		/**
		 * Populate the EncounterType enum and _encounters list
		 * with encounters for each pokemon type.
		 * To be called once at script initialisation.
		 */
		_populateTypedEncounters() {
			for (const type of this.getPokemonTypes()) {
				EncounterType.Typed[type] = "typed-" + type.toLowerCase();
				this._encounters[EncounterType.Typed[type]] = {
					encounterType: "Route",
					pokemonType:[
						PokemonType[type],
						PokemonType.None,
					],
					shiny: false,
					shadow: false,
					pokerus: GameConstants.Pokerus.Uninfected,
					caught: true,
					caughtShiny: true,
					caughtShadow: true,
				};
			}
		},

		/**
		 * Fetch a list of all pokemon types.
		 *
		 * @return {string[]} - List of pokemon types as strings.
		 */
		getPokemonTypes() {
			return Object.entries(PokemonType)
					.filter(x => typeof x[1] == "number" && x[1] >= 0)
					.map(x => x[0]);
		},

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
			let details;

			switch (quest.constructor) {
				case HarvestBerriesQuest:
					details = {
						type: QuestType.BERRY,
						berry: BerryType[quest.berryType],
					};
					break;

				case GainFarmPointsQuest:
					details = {type: QuestType.FARM_POINTS};
					break;

				case GainMoneyQuest:
					details = {type: QuestType.POKEDOLLARS};
					break;

				case MineItemsQuest:
					details = {type: QuestType.MINE_ITEMS};
					break;

				case MineLayersQuest:
					details = {type: QuestType.MINE_LAYERS};
					break;

				case GainTokensQuest:
					details = {type: QuestType.DUNGEON_TOKENS};
					break;

				case CapturePokemonsQuest:
					details = {type: QuestType.CATCH_POKEMON};
					break;

				case CatchShiniesQuest:
					details = {type: QuestType.CATCH_SHINIES};
					break;

				case CapturePokemonTypesQuest:
					details = {
						type: QuestType.CATCH_TYPED,
						pokemonType: PokemonType[quest.type],
					};
					break;

				case HatchEggsQuest:
					details = {type: QuestType.HATCH_EGGS};
					break;

				case UsePokeballQuest:
					details = {
						type: QuestType.USE_POKEBALL,
						ball: GameConstants.Pokeball[quest.pokeball],
					};
					break;

				case DefeatPokemonsQuest:
					details = {
						type: QuestType.ROUTE_DEFEAT,
						route: Routes.getRoute(quest.region, quest.route).routeName,
					};
					break;

				case DefeatGymQuest:
					details = {
						type: QuestType.GYM,
						gym: quest.gymTown,
					};
					break;

				case DefeatDungeonQuest:
					details = {
						type: QuestType.CLEAR_DUNGEON,
						dungeon: quest.dungeon,
					};
					break;

				default:
					details = {type: QuestType.UNKNOWN};
					break;
			}

			details.amount = quest.amount;
			if (quest.initial() == null) {
				details.amountRemaining = quest.amount;
			} else {
				details.amountRemaining = quest.amount - (quest.focus() - quest.initial());
			}

			return details;
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

		// Encounter type definitions for querying the filters
		_encounters: {
			[EncounterType.REGULAR]: {
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

			[EncounterType.SHINY]: {
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
			},

			// Entries for EncounterType.Typed[...] are filled in dynamically
		},

		/**
		 * Check if the current pokeball settings
		 * will catch a given encounter type.
		 *
		 * @param encounterType {EncounterType} - Type to query.
		 * @return                              - Truthy if the player's
		 *                                        current pokeball filter
		 *                                        settings will catch this type
		 *                                        of encounter,
		 *                                        falsey otherwise.
		 */
		willCatch(encounterType) {
			const encounter = this._encounters[encounterType];
			const filter = App.game.pokeballFilters.findMatch(encounter);
			if (!filter) {
				return false;
			}

			const pokeballType = filter.ball();
			return (pokeballType != GameConstants.Pokeball.None
				&& App.game.pokeballs.pokeballs[pokeballType].quantity() > 0);
		},

		/**
		 * Find the index of the pokeball filter which will match
		 * a given pokemon encounter type.
		 *
		 * @param encounterType {EncounterType} - Type to query.
		 * @return              {number}        - Index of the filter which
		 *                                        matches, or -1 if none match.
		 */
		getFilterIndex(encounterType) {
			const encounter = this._encounters[encounterType];
			const filter = App.game.pokeballFilters.findMatch(encounter);
			return App.game.pokeballFilters.list.indexOf(filter);
		},

		/**
		 * Find the type of pokeball which will be used
		 * for the given encounter type.
		 *
		 * @param encounterType {EncounterType} - Type to query.
		 * @return              {string}        - String ID of the pokeball
		 *                                        which will be used.
		 */
		getPokeballForEncounter(encounterType) {
			const encounter = this._encounters[encounterType];
			const filter = App.game.pokeballFilters.findMatch(encounter);
			if (!filter) {
				return "None";
			}

			return GameConstants.Pokeball[filter.ball()];
		},

		/**
		 * Check how many of the given pokeball the player owns.
		 *
		 * @param ball {string} - String ID of the pokeball to query.
		 * @return     {number} - Amount of pokeballs of the given type owned.
		 */
		getPokeballAmount(ball) {
			const ballId = GameConstants.Pokeball[ball];
			return App.game.pokeballs.pokeballs[ballId].quantity();
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

			// Convert pokemon types to numeric
			if (key == "pokemonType") {
				value = PokemonType[value];
			}

			App.game.pokeballFilters.addFilterOption(filter, key);
			filter.options[key].observableValue(value);
		},

		/**
		 * Set the pokeball used for the given pokeball filter.
		 *
		 * @param uuid {string} - UUID of the filter to modify.
		 * @param ball {string} - String ID of the pokeball to use.
		 */
		setFilterBall(uuid, ball) {
			const filter = this._getFilter(uuid);

			if (ball != "None") {
				const ballId = GameConstants.Pokeball[ball];
				if (ballId == GameConstants.Pokeball.Masterball
						&& App.game.challenges.list.disableMasterballs.active()) {
					throw new Error("Cannot use masterballs with the Disable Masterball challenge active");
				}

				const pokeball = App.game.pokeballs.pokeballs[ballId];
				if (!pokeball.unlocked()) {
					throw new Error("Have not unlocked " + ball);
				}
			}

			filter.ball(GameConstants.Pokeball[ball]);
		},

		/**
		 * Check if the player is currently battling at a route.
		 *
		 * @return - Truthy if the player is at a route. Falsey if not.
		 */
		isOnRoute() {
			return App.game.gameState == GameConstants.GameState.fighting;
		},

		/**
		 * Check if the player is currently sitting at a town.
		 *
		 * @return - Truthy if the player is at a town. Falsey if not.
		 */
		isInTown() {
			return App.game.gameState == GameConstants.GameState.town;
		},

		/**
		 * Find the route which the player is currently on.
		 *
		 * @return {string} - Name of the route.
		 */
		getCurrentRoute() {
			const route = Routes.getRoute(player.region, player.route());
			return route.routeName;
		},

		/**
		 * Find the town which the player is currently at.
		 *
		 * @return {string} - Name of the town.
		 */
		getCurrentTown() {
			return player.town().name;
		},

		/**
		 * Not required by interface.
		 * Fetch a route object by its full name.
		 *
		 * @param name {string}      - Name of the route to look up.
		 * @return     {RegionRoute} - Route object, or null if not found.
		 */
		_getRouteByName(name) {
			return Routes.regionRoutes.find(r => r.routeName == name);
		},

		/**
		 * Find which pokemon types will be encountered on the given route.
		 *
		 * @param routeName {string} - Name of the route to look up.
		 * @return          {Object} - Mapping of pokemon types encountered
		 *                             as strings to proportion of
		 *                             encounters with that type.
		 */
		getTypesEncounteredOnRoute(routeName) {
			const route = this._getRouteByName(routeName);
			const pokemonEncountered = RouteHelper.getAvailablePokemonList(
					route.number, route.region);

			const typesEncountered = {};
			for (const name of pokemonEncountered) {
				const pkmn = PokemonHelper.getPokemonByName(name);
				const types = [pkmn.type1, pkmn.type2];

				for (const typeId of types) {
					const type = PokemonType[typeId];

					if (type == "None") {
						continue;
					}

					if (!(t in typesEncountered)) {
						typesEncountered[t] = 1;
					} else {
						typesEncountered[t] += 1;
					}
				}
			}

			for (const type of Object.keys(typesEncountered)) {
				typesEncountered[type] /= pokemonEncountered.length;
			}

			return typesEncountered;
		},

		/**
		 * Fetch the subregion which the given route is in.
		 *
		 * @param routeName {string} - Name of the route to look up.
		 * @return          {string} - Name of the subregion containing the route.
		 */
		getRouteSubregion(routeName) {
			const route = this._getRouteByName(routeName);
			const regionId = route.region;
			const subregionId = route.subRegion ?? 0;
			const subregion = SubRegions.getSubRegionById(
					regionId, subregionId);
			return subregion.name;
		},

		/**
		 * Not required by interface.
		 * Fetch the subregion object by name.
		 *
		 * @param name {string}    - Name of the subregion to look up.
		 * @return     {SubRegion} - Subregion object.
		 */
		_getSubregion(name) {
			for (const regionalList of Object.values(SubRegions.list)) {
				for (const subr of regionalList) {
					if (subr.name == name) {
						return subr;
					}
				}
			}

			throw new Error("Failed to find subregion: " + name);
		},

		/**
		 * Fetch a list of routes in the given subregion.
		 *
		 * @param subregionName {string}   - Name of the subregion to look up.
		 * @return              {string[]} - List of names of routes
		 *                                   in that subregion.
		 */
		getRoutesBySubregion(subregionName) {
			const subregion = this._getSubregion(subregionName);
			return Routes.regionRoutes.filter(r =>
					r.region == subregion.region
					&& (r.subRegion ?? 0) == subregion.id);
		},

		/**
		 * Fetch the subregion which the given town is in.
		 *
		 * @param townName {string} - Name of the town to look up.
		 * @return         {string} - Name of the subregion containing the town.
		 */
		getTownSubregion(townName) {
			const town = TownList[townName];
			const subregion = SubRegions.getSubRegionById(
					town.region, town.subRegion ?? 0);
			return subregion.name;
		},

		/**
		 * Fetch the subregion which the player is currently in.
		 *
		 * @return {string} - Name of the subregion the player is in.
		 */
		getPlayerSubregion() {
			const subregion = SubRegions.getSubRegionById(
					player.region, player.subregion ?? 0);
			return subregion.name;
		},

		/**
		 * Move the the given route within the same subregion.
		 *
		 * @param routeName {string} - Name of the route to move to.
		 */
		moveToRoute(routeName) {
			const route = this._getRouteByName(routeName);

			if (route.region != player.region
					|| (route.subRegion ?? 0) != (player.subregion ?? 0)) {
				throw new Error("moveToRoute cannot move between subregions");
			}

			MapHelper.moveToRoute(route.number, route.region);
		},

		/**
		 * Move the the given town within the same subregion.
		 *
		 * @param townName {string} - Name of the town to move to.
		 */
		moveToTown(townName) {
			const town = TownList[townName];

			if (town.region != player.region
					|| (town.subRegion ?? 0) != (player.subregion ?? 0)) {
				throw new Error("moveToTown cannot move between subregions");
			}

			MapHelper.moveToTown(townName);
		},

		/**
		 * Check if the player has the required defeats on a route to have "completed" it.
		 *
		 * @param routeName {string} - Name of the route to look up.
		 * @return                   - Truthy if the route is complete.
		 *                             Falsey if not.
		 */
		routeCompleted(routeName) {
			const route = this._getRouteByName(routeName);
			const routeKills = App.game.statistics.routeKills[route.region][route.number]();
			return routeKills >= GameConstants.ROUTE_KILLS_NEEDED;
		},

		/**
		 * Check if the given town is unlocked and accessible.
		 *
		 * @param townName {string} - Name of town to look up.
		 * @return                  - Truthy if unlocked. Falsey if not.
		 */
		townUnlocked(townName) {
			const town = TownList[townName];
			return town.isUnlocked();
		},

		/**
		 * Check if the player has completed the given gym.
		 *
		 * @param gymName {string} - Name of the gym to look up.
		 * @return                 - Truthy if the gym is complete.
		 *                           Falsey if not.
		 */
		gymCompleted(gymName) {
			return GymList[gymName].clears() > 0;
		},

		/**
		 * Find the name of the town containing the given gym.
		 *
		 * @param gymName {string} - Name of the gym to look up.
		 * @return        {string} - Town name.
		 */
		getGymTownName(gymName) {
			return GymList[gymName].parent.name;
		},

		/**
		 * Check if the player has previously beaten the given dungeon.
		 *
		 * @param dungeonName {string} - Name of the dungeon to look up.
		 * @return                     - Truthy if the dungeon has been
		 *                               cleared. Falsey if not.
		 */
		dungeonCompleted(dungeonName) {
			const dungIdx = GameConstants.getDungeonIndex(dungeonName);
			return App.game.statistics.dungeonsCleared[dungIdx]() > 0;
		},

		/**
		 * Find how many dungeon tokens entry to the given dungeon costs.
		 *
		 * @param dungeonName {string} - Name of the dungeon to look up.
		 * @return            {number} - Dungeon cost in dungeon tokens.
		 */
		getDungeonCost(dungeonName) {
			return dungeonList[dungeonName].tokenCost;
		},

		/**
		 * Check how many dungeon tokens the player has.
		 *
		 * @return {number} - Number of dungeon tokens.
		 */
		getDungeonTokens() {
			return App.game.wallet.currencies[Currency.dungeonToken]();
		},
	};

	page._populateTypedEncounters();

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
	const DELAY_MOVEMENT        =      1000;

	const POKEBALL_FILTER_REGULAR_NAME = "!syfQuest caught";

	// Represents either a route or a town
	class Location {
		constructor(type, name) {
			this.type = type;
			this.name = name;
		}

		// abstract getSubregion()
		// abstract moveTo()

		canMoveTo() {
			// We aren't (yet) moving between subregions
			return this.getSubregion() == page.getPlayerSubregion();
		}

		equals(that) {
			return (that instanceof Location
					&& that.type == this.type
					&& that.name == this.name);
		}

		// Convert a simple object with type and name properties
		// to a Location subclass object
		static fromRaw(obj) {
			if (obj == null) {
				return null;
			}

			switch (obj.type) {
				case "route":
					return new RouteLocation(obj.name);

				case "town":
					return new TownLocation(obj.name);

				default:
					throw new Error("Invalid location type: " + obj.type);
			}
		}
	}

	class RouteLocation extends Location {
		constructor(routeName) {
			super("route", routeName);
		}

		getSubregion() {
			return page.getRouteSubregion(this.name);
		}

		canMoveTo() {
			// Avoid going to routes which haven't yet been completed
			return super.canMoveTo() && page.routeCompleted(this.name);
		}

		moveTo() {
			page.moveToRoute(this.name);
		}
	}

	class TownLocation extends Location {
		constructor(townName) {
			super("town", townName);
		}

		getSubregion() {
			return page.getTownSubregion(this.name);
		}

		canMoveTo() {
			return super.canMoveTo() && page.townUnlocked(this.name);
		}

		moveTo() {
			page.moveToTown(this.name);
		}
	}

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
		// readFn may be passed to process the raw value when reading
		constructor(scope, key, defaultVal, readFn=x=>x) {
			this.scope = scope;
			this.key = key;
			this.defaultVal = defaultVal;
			this.readFn = readFn;
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

			return this.readFn(settings[this.key]);
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
	Setting.activeMovement        = new Setting(SETTINGS_SCOPE_SESSION, "activeMovement",  false);

	Setting.currentPosition = new Setting(SETTINGS_SCOPE_SESSION, "currentPosition", null, Location.fromRaw);
	Setting.returnPosition  = new Setting(SETTINGS_SCOPE_SESSION, "returnPosition",  null, Location.fromRaw);

	class FilterType {
		constructor(encounterType, name, options, settingsKey) {
			this.encounterType = encounterType;
			this.name = name;
			this.options = options;

			this.settingCreated = new Setting(SETTINGS_SCOPE_SESSION, settingsKey, false);
			this.isRequired = false;
		}

		addFilter(ball=null) {
			if (this.settingCreated.get()) {
				this.removeFilter();
			}

			const filterIdx = page.getFilterIndex(this.encounterType) + 1;

			const filterUuid = page.createPokeballFilter(filterIdx);
			page.setFilterName(filterUuid, this.name);
			
			for (const [k, v] of Object.entries(this.options)) {
				page.addFilterOption(filterUuid, k, v);
			}

			if (ball != null) {
				page.setFilterBall(filterUuid, ball);
			}

			this.settingCreated.set(true);
		}

		removeFilter() {
			const matchingFilters = [];
			const totalFilterCount = page.getTotalFilterCount();
			for (let i = 0; i < totalFilterCount; ++i) {
				const uuid = page.filterIndexToUuid(i);
				if (page.getFilterName(uuid) == this.name) {
					matchingFilters.push(uuid);
				}
			}

			for (const uuid of matchingFilters) {
				page.deleteFilter(uuid);
			}

			this.settingCreated.set(false);
		}

		removeIfNotNeeded() {
			if (!this.isRequired && this.settingCreated.get()) {
				this.removeFilter();
				return true;
			}

			return false;
		}
	}

	FilterType.all = [
		FilterType.regular = new FilterType(EncounterType.REGULAR,
			"!syfQuest caught", {
				caught: true,
			},
			"hasRegularFilter"),

		FilterType.shiny = new FilterType(EncounterType.SHINY,
			"!syfQuest shiny", {
				shiny: true,
				caughtShiny: true,
			},
			"hasShinyFilter"),
	];

	FilterType.byPokemonType = {};

	for (const type of page.getPokemonTypes()) {
		const filter = new FilterType(EncounterType.Typed[type],
			"!syfQuest " + type.toLowerCase(), {
				caught: true,
				pokemonType: type,
			},
			`hasTyped${type}Filter`);

		FilterType.all.push(filter);
		FilterType.byPokemonType[type] = filter;
	}

	function getPlayerLocation() {
		if (page.isOnRoute()) {
			return new RouteLocation(page.getCurrentRoute());
		}

		if (page.isInTown()) {
			return new TownLocation(page.getCurrentTown());
		}

		return null;
	}

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

	function willEncounterTypeOnCurrentRoute(pokemonType) {
		if (!page.isOnRoute()) {
			return false;
		}

		const currentRoute = page.getCurrentRoute();
		const typesEncountered = page.getTypesEncounteredOnRoute(currentRoute);
		return pokemonType in typesEncountered
				&& typesEncountered[pokemonType] > 0;
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
				return (page.willCatch(EncounterType.REGULAR)
						|| Setting.modifyPokeballFilters.get());

			case QuestType.CATCH_SHINIES:
				return (page.willCatch(EncounterType.SHINY)
						|| Setting.modifyPokeballFilters.get());

			case QuestType.CATCH_TYPED:
				if (!page.willCatch(EncounterType.Typed[quest.pokemonType])
						&& !Setting.modifyPokeballFilters.get()) {
					return false;
				}

				return (willEncounterTypeOnCurrentRoute(quest.pokemonType)
						|| Setting.activeMovement.get());

			case QuestType.USE_POKEBALL:
				return (page.getPokeballAmount(quest.ball) >= quest.amount
					&& (page.getPokeballForEncounter(EncounterType.REGULAR)
						|| Setting.modifyPokeballFilters.get()));

			case QuestType.HATCH_EGGS:
				return window.syfScripts?.breeder?.canCompleteEggsQuest?.();

			case QuestType.ROUTE_DEFEAT: {
				const questRoute = new RouteLocation(quest.route);

				if (questRoute.equals(getPlayerLocation())) {
					return true;
				}

				return (Setting.activeMovement.get()
						&& canMove() && questRoute.canMoveTo()
						&& Setting.currentPosition.get() == null);
			}

			case QuestType.GYM: {
				if (!Setting.activeMovement.get()
						|| page.gymCompleted(quest.gym)
						|| !window.syfScripts?.gym?.canClearGyms?.()) {
					return false;
				}

				const gymTownName = page.getGymTownName(quest.gym);
				const gymTown = new TownLocation(gymTownName);
				if (!gymTown.equals(getPlayerLocation())
						&& (!canMove() || !gymTown.canMoveTo())) {
					return false;
				}

				return Setting.currentPosition.get() == null;
			}

			case QuestType.CLEAR_DUNGEON: {
				if (!Setting.activeMovement.get()) {
					return false;
				}

				if (!page.dungeonCompleted(quest.dungeon)) {
					return false;
				}

				if (!window.syfScripts?.dungeonCrawler?.canClearDungeons?.()) {
					return false;
				}

				if (!canAffordDungeonRuns(quest.dungeon, quest.amountRemaining)) {
					return false;
				}

				const dungeonTown = new TownLocation(quest.dungeon);
				return (dungeonTown.equals(getPlayerLocation())
						|| (canMove() && dungeonTown.canMoveTo()));
			}

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

	function updatePokeballFilters() {
		FilterType.all.forEach(ft => { ft.isRequired = false; });

		const questCount = page.getActiveQuestCount();
		for (let i = 0; i < questCount; ++i) {
			if (page.activeQuestCompleted(i)) {
				continue;
			}

			const qi = page.activeQuestIdxToQuestIdx(i);
			const quest = page.getQuestInfo(qi);

			switch (quest.type) {
				case QuestType.DUNGEON_TOKENS:
				case QuestType.CATCH_POKEMON:
					if (page.willCatch(EncounterType.REGULAR)) {
						FilterType.regular.isRequired = true;
						continue;
					}

					FilterType.regular.addFilter();
					return true;

				case QuestType.CATCH_SHINIES:
					if (page.willCatch(EncounterType.SHINY)) {
						FilterType.shiny.isRequired = true;
						continue;
					}

					FilterType.shiny.addFilter();
					return true;

				case QuestType.CATCH_TYPED:
					if (page.willCatch(EncounterType.Typed[quest.pokemonType])) {
						FilterType.byPokemonType[quest.pokemonType]
								.isRequired = true;
						continue;
					}

					FilterType.byPokemonType[quest.pokemonType].addFilter();
					return true;

				case QuestType.USE_POKEBALL:
					if (page.getPokeballForEncounter(EncounterType.REGULAR) == quest.ball) {
						FilterType.regular.isRequired = true;
						continue;
					}

					FilterType.regular.addFilter(quest.ball);
					return true;
			}
		}

		for (const ft of FilterType.all) {
			if (ft.removeIfNotNeeded()) {
				return true;
			}
		}

		return false;
	}

	function canMove() {
		return page.isOnRoute() || page.isInTown();
	}

	function moveToActiveLocation(loc) {
		if (Setting.returnPosition.get() == null) {
			Setting.returnPosition.set(getPlayerLocation());
		}

		loc.moveTo();
		Setting.currentPosition.set(loc);
	}

	function canAffordDungeonRuns(dungeonName, count) {
		const dtCost = page.getDungeonCost(dungeonName) * count;
		return page.getDungeonTokens() >= dtCost;
	}

	function findBestRouteForType(pkmnType) {
		const playerSubr = page.getPlayerSubregion();
		const localRoutes = page.getRoutesBySubregion(playerSubr);

		const bestRoute = null;
		const bestFrequency = 0;
		for (const route of localRoutes) {
			const typesEncountered = page.getTypesEncounteredOnRoute(route);
			if (!(pkmnType in typesEncountered)) {
				continue;
			}

			const freq = typesEncountered[pkmnType];
			if (freq > bestFrequency) {
				bestRoute = route;
				bestFrequency = freq;
			}
		}

		return bestRoute;
	}

	function updateActiveMovement() {
		if (!canMove()) {
			return false;
		}

		const expectedPos = Setting.currentPosition.get();
		const playerLoc = getPlayerLocation();
		if (expectedPos != null && !expectedPos.equals(playerLoc)) {
			disableActiveMovement();
			console.warn("Player has moved. Disabling active movement");
			return false;
		}

		const questCount = page.getActiveQuestCount();
		for (let i = 0; i < questCount; ++i) {
			if (page.activeQuestCompleted(i)) {
				continue;
			}

			const qi = page.activeQuestIdxToQuestIdx(i);
			const quest = page.getQuestInfo(qi);

			switch (quest.type) {
				case QuestType.ROUTE_DEFEAT: {
					const questLoc = new RouteLocation(quest.route);
					if (questLoc.equals(playerLoc)) {
						return false;
					}

					if (!questLoc.canMoveTo()) {
						continue;
					}

					moveToActiveLocation(questLoc);
					return true;
				}

				case QuestType.CATCH_TYPED: {
					if (willEncounterTypeOnCurrentRoute(quest.pokemonType)) {
						return false;
					}

					const questRoute = findBestRouteForType(quest.pokemonType);
					if (questRoute == null || !questRoute.canMoveTo()) {
						continue;
					}

					moveToActiveLocation(questLoc);
					return true;
				}

				case QuestType.GYM: {
					if (!page.gymCompleted(quest.gym)
							|| !window.syfScripts?.gym?.canClearGyms?.()) {
						continue;
					}

					const gymTownName = page.getGymTownName(quest.gym);
					const gymTown = new TownLocation(gymTownName);
					if (gymTown.equals(playerLoc)) {
						if (window.syfScripts.gym.busy?.()) {
							return false;
						}

						window.syfScripts.gym.clearGym(
								quest.gym, quest.amountRemaining);
						return true;
					}

					if (gymTown.canMoveTo()) {
						moveToActiveLocation(gymTown);
						return true;
					}

					continue;
				}

				case QuestType.CLEAR_DUNGEON: {
					if (!page.dungeonCompleted(quest.dungeon)
							|| !window.syfScripts?.dungeonCrawler?.canClearDungeons?.()
							|| !canAffordDungeonRuns(quest.dungeon, quest.amountRemaining)){
						continue;
					}

					const dungeonTown = new TownLocation(quest.dungeon);
					if (dungeonTown.equals(playerLoc)) {
						if (window.syfScripts.dungeonCrawler.busy()) {
							return false;
						}

						window.syfScripts.dungeonCrawler.clearDungeon(
								quest.amountRemaining);
						return true;
					}

					if (dungeonTown.canMoveTo()) {
						moveToActiveLocation(dungeonTown);
						return true;
					}

					continue;
				}
			}
		}

		// If we exit the quest loop, there aren't any quest requiring specific locations...
		const returnPos = Setting.returnPosition.get();
		if (returnPos != null) {
			returnPos.moveTo();
			Setting.returnPosition.set(null);
			Setting.currentPosition.set(null);
			return true;
		}
	}

	function tick() {
		if (!page.gameLoaded()) {
			return setTimeout(tick, DELAY_IDLE);
		}

		if (Setting.activeMovement.get() && updateActiveMovement()) {
			return setTimeout(tick, DELAY_MOVEMENT);
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

	function disablePokeballFilters() {
		FilterType.all.forEach(ft => ft.removeFilter());
		Setting.modifyPokeballFilters.set(false);
	}

	/**
	 * User-facing command.
	 * Set if the script should modify pokeball filters
	 * to actively complete quests or not.
	 *
	 * @param value - Truthy to modify pokeball filters, falsey to not.
	 */
	function cmdSetPokeballFilters(value=true) {
		if (value) {
			Setting.modifyPokeballFilters.set(true);
		} else {
			disablePokeballFilters();
		}

		console.log((value? "Started" : "Stopped"), "modifying pokeball filters to complete quests");
	}

	function disableActiveMovement() {
		Setting.activeMovement.set(false);
		Setting.currentPosition.set(null);
		Setting.returnPosition.set(null);
	}

	/**
	 * User-facing command.
	 * Set if the script should move to different locations
	 * to actively complete quests or not.
	 *
	 * @param value - Truthy to move locations, falsey to not.
	 */
	function cmdSetActiveMovement(value=true) {
		if (value) {
			Setting.activeMovement.set(!!value);
		} else {
			disableActiveMovement();
		}

		console.log((value? "Started" : "Stopped"), "moving to complete quests");
	}

	/**
	 * User-facing command.
	 * Set if the script should use all available methods
	 * to actively complete quests or not.
	 *
	 * @param value - Truthy to actively attempt to complete quests,
	 *                falsey to not.
	 */
	function cmdActiveQuests(value=true) {
		Setting.collectQuests.set(!!value);
		Setting.startQuests.set(!!value);

		if (value) {
			Setting.modifyPokeballFilters.set(true);
			Setting.activeMovement.set(true);
		} else {
			disablePokeballFilters();
			disableActiveMovement();
		}

		console.log((value? "Started" : "Stopped"), "actively completing quests");
	}

	/**
	 * User-facing command.
	 * Set if the script should attempt to only passively complete quests.
	 *
	 * @param value - Truthy to attempt to complete quests,
	 *                falsey to not.
	 */
	function cmdPassiveQuests(value=true) {
		Setting.collectQuests.set(!!value);
		Setting.startQuests.set(!!value);

		disablePokeballFilters();
		disableActiveMovement();

		console.log((value? "Started" : "Stopped"), "passively completing quests");
	}

	/**
	 * User-facing command.
	 * Stop all activity by this script until reactivated.
	 */
	function cmdStop() {
		Setting.collectQuests.set(false);
		Setting.startQuests.set(false);

		disablePokeballFilters();
		disableActiveMovement();

		console.log("Stopped completing quests");
	}

	function exposeCommands() {
		window[WINDOW_KEY] = {
			collectQuests: cmdSetCollect,
			startQuests:   cmdSetStartQuests,

			modifyPokeballFilters: cmdSetPokeballFilters,
			activeMovement:        cmdSetActiveMovement,

			activeQuests:  cmdActiveQuests,
			passiveQuests: cmdPassiveQuests,
			stop:          cmdStop,
		};
	}

	(function main() {
		setTimeout(tick, DELAY_INIT);
		exposeCommands();
	})();
})();

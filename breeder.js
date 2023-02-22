// ==UserScript==
// @name         PokéClicker - Auto-breeder
// @namespace    http://tampermonkey.net/
// @version      1.17
// @description  Handles breeding eggs automatically
// @author       SyfP
// @match        https://www.pokeclicker.com/
// @grant        none
// ==/UserScript==

/* global App, GameConstants, ItemList, player, PokemonHelper, PokemonType, Underground */

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
		 * Check if the player is able to access the breeding system.
		 * Not required by interface.
		 *
		 * @return {boolean} - True if the player can access breeding, false otherwise.
		 */
		_canAccessBreeding() {
			return App.game.breeding.canAccess();
		},

		/**
		 * Attempt to hatch the given egg in the given slot.
		 *
		 * @param eggIdx {number}  - Index of the egg slot to hatch.
		 * @return                 - Truthy if the egg was hatched successfully, falsey otherwise.
		 */
		hatch(eggIdx) {
			if (!this._canAccessBreeding()) {
				return false;
			}

			const breeding = App.game.breeding;
			if (breeding.eggSlots <= eggIdx) {
				return false;
			}

			const egg = breeding.eggList[eggIdx]();
			if (egg.pokemon == "MissingNo.") {
				return false;
			}

			if (egg.stepsRemaining() > 0) {
				return false;
			}

			let rtn = breeding.hatchPokemonEgg(eggIdx);
			return true;
		},

		/**
		 * Test if the player is able to add a new egg.
		 *
		 * @return {boolean} - True if a new egg may be added. False otherwise.
		 */
		canBreed() {
			const breeding = App.game.breeding;
			return this._canAccessBreeding() && (breeding.hasFreeEggSlot() || breeding.hasFreeQueueSlot());
		},

		/**
		 * Test if the player has a free egg slot.
		 *
		 * @return - Truthy if there is a free egg slot. Falsey otherwise.
		 */
		hasFreeEggSlot() {
			return this.canBreed() && App.game.breeding.hasFreeEggSlot();
		},

		/**
		 * Find the current length of the breeding queue.
		 *
		 * @return {number} Number of pokemon currently in the breeding queue.
		 */
		queueLength() {
			return App.game.breeding.queueList().length;
		},

		/**
		 * Check if the player has at least one pokemon in the queue.
		 *
		 * @return - Truthy if the player has one or more pokemon in the breeding queue. Falsey otherwise.
		 */
		hasPokemonInQueue() {
			return this.queueLength() > 0;
		},

		/**
		 * Remove one pokemon from the breeding queue.
		 */
		removeFromQueue() {
			App.game.breeding.removeFromQueue(0);
		},

		/**
		 * Check if a specific pokemon is able to be bred.
		 *
		 * @param dexId {number} - Pokedex id of the pokemon.
		 * @return               - Truthy if the pokemon may be bred, falsey if not.
		 */
		pokemonIsBreedable(dexId) {
			if (!this.canBreed()) {
				return false;
			}

			const mon = App.game.party.getPokemon(dexId);
			return mon && mon.level >= 100 && !mon.breeding;
		},

		/**
		 * Fetch a list of the given pokemon's types.
		 *
		 * @param dexId {number} - Pokedex id of the pokemon.
		 * @return      {string[]} - Array-like of types of the pokemon. Should be of length 1 or 2.
		 */
		getPokemonType(dexId) {
			return pokemonMap[dexId].type.map(x => PokemonType[x]);
		},

		/**
		 * Check if the given value represents a real pokemon type in the game.
		 *
		 * @param type {string|number} - Name or id of a pokemon type.
		 * @return                     - Truthy if the type exists, falsey otherwise.
		 */
		pokemonTypeIsValid(type) {
			return type in PokemonType;
		},

		/**
		 * Attempt to breed the given pokemon to produce an egg.
		 *
		 * @param dexId {number} - Pokedex id of the pokemon to breed.
		 * @return               - Truthy if the pokemon was bred. Falsey otherwise.
		 */
		breed(dexId) {
			if (!this.canBreed() || !this.pokemonIsBreedable(dexId)) {
				return false;
			}

			const mon = App.game.party.getPokemon(dexId);
			App.game.breeding.addPokemonToHatchery(mon);
			return true;
		},

		/**
		 * Not required by interface.
		 * Return the name of an egg item owned by the player if they have one.
		 * Only eggs which are able to give the player a new species should be returned.
		 * If the player owns multiple, any of the owned items are acceptable
		 *
		 * @return {string|null} - Name of the egg item if the player has one. Null otherwise.
		 */
		_getHatchableEggItemName() {
			for (let i = 0;; ++i) {
				let eggName = GameConstants.EggItemType[i];
				if (!eggName) {
					break;
				}

				let amtOwned = player.itemList[eggName]();
				if (amtOwned <= 0) {
					continue;
				}

				let item = ItemList[eggName];
				if (item.getCaughtStatus()) {
					continue;
				}

				return eggName;
			}

			return null;
		},

		/**
		 * Not required by interface.
		 * Fetch a fossil owned the player whose pokemon the player has not yet caught.
		 *
		 * @return {Object|null} - Fossil object if the player owns one, or null otherwise.
		 */
		_getOwnedFossil() {
			return player.mineInventory()
					.find(item => item.valueType == "Mine Egg"
							&& item.amount() > 0
							&& this._unlockedFossil(item)
							&& !App.game.party.alreadyCaughtPokemonByName(
								GameConstants.FossilToPokemon[item.name]))
					|| null;
		},

		/**
		 * Check if the player has at least one fossil or egg item.
		 *
		 * @return - Truthy if the player has an fossil or egg item. Falsey otherwise.
		 */
		hasFossilOrEggItem() {
			return this._getOwnedFossil() != null || this._getHatchableEggItemName() != null;
		},

		/**
		 * Attempt to start hatching an egg if the player has one.
		 *
		 * @return - Truthy if a egg was bred, falsey otherwise.
		 */
		useEggItemIfPresent() {
			if (!this.canBreed()) {
				return false;
			}

			let eggName = this._getHatchableEggItemName();
			if (eggName == null) {
				return false;
			}

			ItemList[eggName].use();
			return true;
		},

		/**
		 * Not required by page interface.
		 * Check if the player has visited the required region to hatch the given fossil.
		 *
		 * @param fossil {Object}  - Fossil object from player.mineInventory()
		 * @return       {boolean} - True if the player has unlocked the fossil, false otherwise.
		 */
		_unlockedFossil(fossil) {
			const pokemonName = GameConstants.FossilToPokemon[fossil.name];
			const pokemonNativeRegion = PokemonHelper.calcNativeRegion(pokemonName);
			return pokemonNativeRegion <= player.highestRegion();
		},

		/**
		 * Attempt to start breeding a fossil if the player has one.
		 *
		 * @return - Truthy if a fossil was bred, falsey otherwise.
		 */
		useFossilIfPresent() {
			if (!this.canBreed()) {
				return false;
			}

			let fossil = this._getOwnedFossil();
			if (!fossil) {
				return false;
			}

			Underground.sellMineItem(fossil.id);
			return true;
		},

		/**
		 * Check for any pokemon which may be bred to produce a new baby prevolution.
		 *
		 * @return {number|null} - Parent pokemon pokedex id, or null if no such pairs are found.
		 */
		getBabyParent() {
			const parentId = Object.entries(pokemonBabyPrevolutionMap)
				// Filter for baby pokemon unlocked, but not yet caught.
				.filter(([parentName, babyName]) => !App.game.party.alreadyCaughtPokemonByName(babyName)
					&& PokemonHelper.calcNativeRegion(babyName) <= player.highestRegion())

				// Filter for parents we are able to breed.
				.map(([parentName, babyName]) => this._getDexId(parentName))
				.find(parentId => parentId != null && this.pokemonIsBreedable(parentId));

			return parentId || null;
		},

		/**
		 * Fetch a list of pokemon which have been caught.
		 *
		 * @return {number[]} - Array-like of pokedex ids of caught pokemon.
		 */
		getCaughtPokemon() {
			return App.game.party.caughtPokemon.map(mon => mon.id);
		},

		/**
		 * Fetch the name of a pokemon from its pokedex id.
		 * This currently only works on pokemon you have caught.
		 *
		 * @param dexId {number} - Pokedex id.
		 * @return      {string} - Name of pokemon.
		 */
		getPokemonName(dexId) {
			let mon = App.game.party.getPokemon(dexId);
			if (!mon) {
				return "Unknown pokemon";
			}

			return mon.name;
		},

		/**
		 * Find the pokedex id of a pokemon with the specified name.
		 * This currently only works on pokemon you have caught.
		 *
		 * @param name {string}      - Name of pokemon.
		 * @return     {number|null} - Pokedex id or null if not found.
		 */
		_getDexId(name) {
			const mon = App.game.party.caughtPokemon.find(p => p.name == name);
			if (!mon) {
				return null;
			}

			return mon.id;
		},

		/**
		 * Check if the player has caught a shiny of the specified species.
		 *
		 * @param dexId {number} - Pokedex id of the species to look up.
		 * @return               - Truthy if the player has that shiny, falsey if not.
		 */
		hasShiny(dexId) {
			return App.game.party.alreadyCaughtPokemon(dexId, true);
		},

		/**
		 * Test if the given pokemon is from the player's highest unlocked region.
		 *
		 * @param dexId {number} - Pokedex id of the species to look up.
		 * @return               - Truthy if the pokemon is from the player's
		 *                         highest region, or falsey otherwise.
		 */
		pokemonIsFromHighestRegion(dexId) {
			const pokemonName = pokemonMap[dexId].name;
			const pokemonNativeRegion = PokemonHelper.calcNativeRegion(pokemonName);
			return pokemonNativeRegion == player.highestRegion();
		},

		/**
		 * Test if the given pokemon is from the player's current region.
		 *
		 * @param dexId {number} - Pokedex id of the species to look up.
		 * @return               - Truthy if the pokemon is from the player's
		 *                         current region, or falsey otherwise.
		 */
		pokemonIsFromCurrentRegion(dexId) {
			const pokemonName = pokemonMap[dexId].name;
			const pokemonNativeRegion = PokemonHelper.calcNativeRegion(pokemonName);
			return pokemonNativeRegion == player.region;
		},

		/**
		 * Find Pokémon types preferred by current active quests.
		 *
		 * @return {string[]} - List of types preferred by Pokémon type quests.
		 */
		getQuestPreferredTypes() {
			return App.game.quests.currentQuests()
				.filter(q => q instanceof CapturePokemonTypesQuest && !q.isCompleted())
				.map(q => PokemonType[q.type]);
		},

		/**
		 * Fetch the highest region the player has unlocked.
		 * 0 for Kanto, 1 for Johto, and so on.
		 *
		 * @return {number} - Index of the player's highest region.
		 */
		getHighestRegion() {
			return player.highestRegion();
		},
	};

	//////////////////////////

	/*
	 * The main functionality of the script should go here.
	 *
	 * Any interaction with the page should only be done
	 * through the page interface defined above.
	 */

	const WINDOW_KEY = "breed";

	// Delays following certain actions
	const DELAY_HATCH   =           800;
	const DELAY_BREED   =           800;
	const DELAY_IDLE    = 5 * 60 * 1000;
	const DELAY_INITIAL =     30 * 1000;

	// How often to report hatched eggs. Report every nth hatched egg.
	const HATCH_LOG_INTERVAL = 10;

	// Maximum task length in minutes
	const MAX_TASK_LENGTH = 60;
	const TASK_LENGTH_REGION_BONUS = 60;

	// The script will not automatically put more than this many pokemon into the breeding queue.
	const QUEUE_LENGTH_CAP = 5;

	/**
	 * Swap two values in an array.
	 *
	 * @param arr {Array}  Array to modify.
	 * @param i   {number} Index of first element.
	 * @param j   {number} Index of second element.
	 */
	function swap(arr, i, j) {
		let v = arr[i];
		arr[i] = arr[j];
		arr[j] = v;
	}

	/**
	 * Shuffle an array.
	 * Affects the original array.
	 *
	 * @param arr {Array} - Array to be shuffled.
	 * @return    {Array} - Reference to the original, now-shuffled array.
	 */
	function shuffle(arr) {
		for (let i = 1; i < arr.length; ++i) {
			let j = Math.floor(Math.random() * (i + 1));
			swap(arr, i, j);
		}

		return arr;
	}

	function toTitleCase(str) {
		return str[0].toUpperCase() + str.slice(1).toLowerCase();
	}

	/**
	 * Choose a pokemon to be bred.
	 *
	 * Highest priority is pokemon who may be bred to produce a new baby species.
	 * Also prioritises the specified types, pokemon from the player's
	 * highest or current region, and non-shiny pokemon.
	 *
	 * @param preferredTypes {string} - List of types to prioritise.
	 * @return               {number} - Pokedex id of the chosen pokemon.
	 */
	function getBreedableMon(preferredTypes=[]) {
		const WEIGHT_PREFERRED_TYPE = 4;
		const WEIGHT_NOT_SHINY      = 2;
		const WEIGHT_CURRENT_REGION = 1;

		const parentMonId = page.getBabyParent();
		if (parentMonId != null) {
			return parentMonId;
		}

		const maxScore = preferredTypes.length * WEIGHT_PREFERRED_TYPE
				+ WEIGHT_NOT_SHINY + WEIGHT_CURRENT_REGION;

		let bestMon = null;
		let bestScore = -1;

		for (let id of shuffle(page.getCaughtPokemon())) {
			if (!page.pokemonIsBreedable(id)) {
				continue;
			}

			let score = 0;

			if (!page.hasShiny(id)) {
				score += WEIGHT_NOT_SHINY;
			}

			for (let type of preferredTypes) {
				if (Array.from(page.getPokemonType(id)).includes(type)) {
					score += WEIGHT_PREFERRED_TYPE;
				}
			}

			if (page.pokemonIsFromHighestRegion(id) || page.pokemonIsFromCurrentRegion(id)) {
				score += WEIGHT_CURRENT_REGION;
			}

			if (bestMon == null || score > bestScore) {
				if (score >= maxScore) {
					return id;
				}

				bestMon = id;
				bestScore = score;
			}
		}

		return bestMon;
	}

	/**
	 * Temporary task to specify types of pokemon to prioritise when breeding.
	 */
	class BreedingTask {
		constructor(expiration, preferredTypes=[]) {
			this.expiration = expiration;
			this.preferredTypes = preferredTypes;
		}

		hasExpired(now=new Date()) {
			return now >= this.expiration;
		}
	}

	let currentTask = null;
	let hatchCount = 0;

	/**
	 * Update the breeding system to perform any actions which need doing.
	 * Intended to be called regularly.
	 */
	function tick() {
		if (currentTask && currentTask.hasExpired()) {
			console.log("Breeding task expired");
			currentTask = null;
		}

		let canBreed = page.canBreed();

		if (page.hasFossilOrEggItem()) {
			let hasFreeEggSlot = page.hasFreeEggSlot();

			// Put a fossil in
			if (canBreed && hasFreeEggSlot) {
				page.useEggItemIfPresent() || page.useFossilIfPresent();
				setTimeout(tick, DELAY_BREED);
				return;
			}

			// Clear the queue to make room for a fossil
			if (!hasFreeEggSlot && page.hasPokemonInQueue()) {
				page.removeFromQueue();
				setTimeout(tick, DELAY_HATCH);
				return;
			}

		// Starting breeding/queueing a new mon
		} else if (canBreed && page.queueLength() < QUEUE_LENGTH_CAP) {
			const preferredTypes = new Set(currentTask? currentTask.preferredTypes : []);
			for (let type of page.getQuestPreferredTypes()) {
				preferredTypes.add(type);
			}

			const bestMonId = getBreedableMon(Array.from(preferredTypes));
			if (bestMonId != null) {
				page.breed(bestMonId);
				setTimeout(tick, DELAY_BREED);
				return;
			}
		}

		// Hatch an egg
		for (let i = 0; i < 4; ++i) {
			if (page.hatch(i)) {
				hatchCount += 1;
				if (hatchCount % HATCH_LOG_INTERVAL == 0) {
					console.log(`Auto-hatched ${hatchCount} eggs this session`);
				}

				setTimeout(tick, DELAY_HATCH);
				return;
			}
		}

		setTimeout(tick, DELAY_IDLE);
	}

	/**
	 * User facing command.
	 * Choose a type to prefer breeding for a short period of time.
	 *
	 * @param types   {string} - List of pokemon types to prefer, as a string.
	 *                           If more than one are specified, the should be given as a comma-separated list.
	 * @param minutes {number} - Number of minutes the preference should remain active for.
	 */
	function cmdPreferType(types, minutes=Infinity) {
		if (typeof(types) != "string") {
			throw new Error("First parameter type should be a pokemon type");
		}

		const typeList = types.split(/,/g).map(type => {
			type = toTitleCase(type.trim());

			if (!page.pokemonTypeIsValid(type)) {
				throw new Error(`'${type}' is not a valid pokemon type`);
			}

			return type;
		});

		if (typeof minutes != "number") {
			throw new Error("Second parameter minutes should be a number");
		}

		if (minutes < 0) {
			throw new Error("Minutes should be non-negative");
		}

		let maxLength = MAX_TASK_LENGTH + page.getHighestRegion() * TASK_LENGTH_REGION_BONUS;

		if (minutes > maxLength) {
			minutes = maxLength;
		}

		const now = +new Date();
		currentTask = new BreedingTask(now + minutes * 60 * 1000, typeList);
		console.log("Starting to prioritise breeding",
				typeList.join(", "), "type pokemon",
				"for", Math.floor(minutes / 60), "hours");
	}

	(function main() {
		setTimeout(tick, DELAY_INITIAL);

		window[WINDOW_KEY] = {
			type: cmdPreferType,
		};

		console.log("Loaded auto-breeder");
	})();
})();

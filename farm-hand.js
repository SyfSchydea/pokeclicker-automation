// ==UserScript==
// @name         Poké-clicker - Better farm hands
// @namespace    http://tampermonkey.net/
// @version      1.36.1+jaboca-1
// @description  Works your farm for you.
// @author       SyfP
// @match        https://www.pokeclicker.com/
// @grant        none
// ==/UserScript==

/* global App, BerryType, EvolveNearFlavorMutation, GainFarmPointsQuest,
          GrowNearBerryMutation, HarvestBerriesQuest, PlotStage */

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

	const PAGE_FARM_SIZE = 5;
	const PAGE_PLOT_COUNT = PAGE_FARM_SIZE ** 2;

	// Indices to Berry.growthTime
	const GROWTH_STAGE_TALLER = 2;
	const GROWTH_STAGE_MATURE = 3;
	const GROWTH_STAGE_DEATH  = 4;

	const page = {
		/**
		 * Check if the player can access the farming minigame.
		 *
		 * @return - Truthy if the player can access farming. Falsey otherwise.
		 */
		canAccess() {
			return App.game && App.game.farming.canAccess();
		},

		/**
		 * Not required by interface.
		 * Fetch the game's farming module if the player has unlocked it.
		 *
		 * @return - App.game.farming or null if not unlocked.
		 */
		_getFarmingModule() {
			const farming = App.game.farming;
			if (!farming.canAccess()) {
				return null;
			}

			return farming;
		},

		/**
		 * Not required by interface.
		 * Fetch the specified plot only if it exists and the player has unlocked it.
		 *
		 * @param plotId {number} - Index of the plot to fetch.
		 * @return                - Plot object or null if not available.
		 */
		_getPlot(plotId, farming=this._getFarmingModule()) {
			if (!farming) {
				return null;
			}

			const plot = farming.plotList[plotId];
			if (!plot || !plot.isUnlocked) {
				return null;
			}

			return plot;
		},

		/**
		 * Check if the given plot is empty.
		 * If the plot doesn't exist, or farming is not unlocked, return truthy.
		 *
		 * @param plotId {number} - Index of the plot to look up.
		 * @return                - Truthy if the plot is empty, false if it is occupied.
		 */
		plotIsEmpty(plotId) {
			const plot = this._getPlot(plotId);
			if (!plot) {
				return true;
			}

			return plot.isEmpty();
		},

		/**
		 * Fetch the type of berry in the given plot.
		 *
		 * @param plotId {number}      - Index of the plot to look up.
		 * @return       {string|null} - Name of berry type, or null if no berry is planted.
		 */
		getBerryInPlot(plotId) {
			const plot = this._getPlot(plotId);
				if (!plot || plot.isEmpty()) {
				return null;
			}

			return this._lookupBerry(plot.berry);
		},

		/**
		 * Fetch the age of the berry in the given plot.
		 * Will return 0 for empty plots.
		 *
		 * @param plotId {number} - Index of the plot to look up.
		 * @return       {number} - Age of the berry in the plot.
		 */
		getPlotAge(plotId) {
			const plot = this._getPlot(plotId);
			if (!plot) {
				return 0;
			}

			return plot.age;
		},

		/**
		 * Find the amount which will be harvested from the given plot,
		 * taking into account any modifiers.
		 *
		 * @param plotId {number} - Index of the plot to look up.
		 * @return       {number} - Number of berries produced on harvest.
		 */
		getPlotHarvestAmount(plotId) {
			return this._getPlot(plotId).harvestAmount();
		},

		/**
		 * Check if a plot is ready to harvest, and harvest it if so.
		 *
		 * @param plotId {number} - Index of the plot to harvest.
		 * @return                - Truthy if the plot was harvested, falsey if not.
		 */
		harvestPlotIfReady(plotId) {
			const farming = this._getFarmingModule();
			if (!farming) {
				return false;
			}

			const plot = this._getPlot(plotId, farming);
			if (!plot || plot.isEmpty() || plot.stage() != PlotStage.Berry) {
				return false;
			}

			farming.harvest(plotId);
			return true;
		},

		/**
		 * Attempt to forcefully empty a plot.
		 * If the user has no remaining shovels, this may still fail.
		 *
		 * @param plotId {number} - Index of the plot to harvest.
		 * @return                - Truthy if the plot was harvested, falsey if not.
		 */
		forceRemovePlot(plotId) {
			if (this.harvestPlotIfReady(plotId)) {
				return true;
			}
			
			const farming = this._getFarmingModule();
			if (!farming) {
				return false;
			}

			if (farming.shovelAmt() <= 0) {
				return false;
			}

			farming.shovel(plotId);
			return true;
		},

		/**
		 * Plant a berry if the plot is empty, and we have berries to plant.
		 *
		 * @param plotId {number} - Index of the plot to plant in.
		 * @return                - Truthy if the berry was planted, falsey if not.
		 */
		attemptPlantBerry(plotId, berryName) {
			const farming = this._getFarmingModule();
			if (!farming) {
				return false;
			}

			const plot = this._getPlot(plotId, farming);
			if (!plot || !plot.isEmpty()) {
				return false;
			}

			const berryId = this._lookupBerry(berryName);
			if (berryId == null || !this.hasUnlockedBerry(berryName)) {
				return false;
			}

			let berryCount = farming.berryList[berryId]();
			if (berryCount < 1) {
				return false;
			}

			farming.plant(plotId, berryId);
			return true;
		},

		/**
		 * Check if the specified berry exists.
		 *
		 * @param berryName {string} - Name of the berry to look up.
		 * @return                   - Truthy if it exists, falsey otherwise.
		 */
		berryExists(berryName) {
			return this._lookupBerry(berryName) != null;
		},

		/**
		 * Find the name of the berry with the specified id.
		 *
		 * @param berryId {number} - Berry id to look up.
		 * @return                 - Name of the berry if it exists, null otherwise.
		 */
		berryNameFromId(berryId) {
			return _lookupBerry(berryId);
		},

		/**
		 * Not required by interface.
		 * Look up the name or id of a berry.
		 *
		 * @param berryIn {string|number}      - Name or id of berry to look up.
		 * @return        {number|string|null} - Name of berry if an id was given.
		 *                                       Id of berry if a name was given.
		 *                                       Null if the berry does not exist.
		 */
		_lookupBerry(berryIn) {
			let berryOut = BerryType[berryIn];
			if (berryOut == undefined) {
				return null;
			}

			return berryOut;
		},

		/**
		 * Not required by interface.
		 * Look up the age of one of the growth stages of the given berry.
		 *
		 * @param name  {string} - Name of berry to look up.
		 * @param stage {number} - Index of the growth stage.
		 * @return      {number} - Age of the given stage, in seconds.
		 */
		_getBerryGrowthStage(name, stage) {
			const berryId = this._lookupBerry(name);
			return App.game.farming.berryData[berryId].growthTime[stage];
		},

		/**
		 * Look up the age at which the given berry matures.
		 *
		 * @param name {string} - Name of berry to look up.
		 * @return     {number} - Age at which berry matures, in seconds.
		 */
		getBerryMaturityAge(name) {
			return this._getBerryGrowthStage(name, GROWTH_STAGE_MATURE);
		},

		/**
		 * Look up the age at which the given berry dies.
		 *
		 * @param name {string} - Name of berry to look up.
		 * @return     {number} - Age at which berry dies, in seconds.
		 */
		getBerryDeathAge(name) {
			return this._getBerryGrowthStage(name, GROWTH_STAGE_DEATH);
		},

		/**
		 * Look up how many berries are harvested when a mature plant of the given berry is harvested.
		 *
		 * @param name {string} - Name of berry to look up.
		 * @return     {number} - Number of berries harvested.
		 */
		getBerryHarvestAmount(name) {
			const id = this._lookupBerry(name);
			return this._getFarmingModule().berryData[id].harvestAmount;
		},

		/**
		 * Not required by interface.
		 * Cached list of berries able to spread. Used by berryCanSpread.
		 */
		_spreadingBerries: null,

		/**
		 * Check if the given berry is able to spread itself to nearby empty tiles on its own.
		 * This should only be Pamtre and Rindo as of Pokeclicker 0.9.3
		 *
		 * @param name {string} - Name of berry to look up.
		 * @return              - Truthy if the berry is able to spread on its own. Falsey if not.
		 */
		berryCanSpread(name) {
			if (!this._spreadingBerries) {
				const farming = this._getFarmingModule();
				if (!farming) {
					return false;
				}

				this._spreadingBerries = farming.mutations
					// This spreading effect in achieved using
					// grow-near-berry-mutations with only one parent berry.
					.filter(m => m instanceof GrowNearBerryMutation
						&& m.berryReqs.length == 1
						&& m.berryReqs[0] == m.mutatedBerry)
					.map(m => BerryType[m.mutatedBerry]);
			}

			return this._spreadingBerries.includes(name);
		},

		/**
		 * Check if the user has unlocked the specified berry.
		 *
		 * @param berryName {string} - Name of the berry to look up.
		 * @return                   - Truthy if the user has unlocked the berry. Falsey otherwise.
		 */
		hasUnlockedBerry(berryName) {
			let id = this._lookupBerry(berryName);
			if (id == null) {
				return false;
			}

			const farming = this._getFarmingModule();
			if (!farming) {
				return false;
			}

			return farming.unlockedBerries[id]();
		},

		/**
		 * Find berry types required by current active quests.
		 *
		 * @return {string|null} - Berry required by quest or null if no such quest.
		 */
		getQuestBerry() {
			const quest = App.game.quests.currentQuests()
				.find(q => q instanceof HarvestBerriesQuest && !q.isCompleted());

			if (!quest) {
				return null;
			}

			return this._lookupBerry(quest.berryType);
		},

		/**
		 * Choose a berry which may be farmed, but which the player owns the least of.
		 *
		 * @param excludeSpecial {boolean} - Set to true to avoid returning berries which require
		 *                                   non-standard farming methods. Currently Kasib and Kebia,
		 *                                   and other berries with harvestAmount=1 if the player has Passhos.
		 * @param maxMaturation  {number}  - Maximum number of seconds to maturation to allow in a returned berry.
		 *                                   Negative to ignore maturation time.
		 * @return           {string|null} - Name of a berry to farm, or null if there are no suitable berries.
		 */
		getBestFarmingBerry(excludeSpecial=false, maxMaturation=-1) {
			const SPECIAL_BERRIES = [BerryType.Kasib, BerryType.Kebia];

			const farming = App.game.farming;
			const harvestAmountRequirement = !excludeSpecial && this.getBerryAmount("Passho") >= 25? 1 : 2;

			let validBerries = farming.berryData
				// Only take berries which yield more from harvesting (eg. Lum does not)
				// plus Kasib and Kebia berries as exceptions
				.filter(b => (b.harvestAmount >= harvestAmountRequirement
						|| (!excludeSpecial && SPECIAL_BERRIES.includes(b.type)))
					&& (maxMaturation < 0 || b.growthTime[GROWTH_STAGE_MATURE] <= maxMaturation))

				// Filter for only berries the player owns
				.map(b => ({data: b, amt: farming.berryList[b.type]()}))
				.filter(o => o.amt > 0);

			if (validBerries.length <= 0) {
				return null;
			}

			// Choose the berry the player owns the fewest of
			let chosenBerry = validBerries.reduce((a, b) => a.amt < b.amt? a : b);
			return BerryType[chosenBerry.data.type];
		},

		/**
		 * Find the berry which dies the fastest.
		 * To be used for farming Kasib berries.
		 * Will usually return Cheri.
		 *
		 * @return {string|null} - Name of a berry to farm, or null if there are no suitable berries.
		 */
		getFastestBerry() {
			const farming = App.game.farming;

			// .reduce callback
			function fastestDeath(a, b) {
				if (a.growthTime[GROWTH_STAGE_DEATH] < b.growthTime[GROWTH_STAGE_DEATH]) {
					return a;
				} else {
					return b;
				}
			}

			let validBerries = farming.berryData
				// Only take berries which yield more from harvesting (eg. Lum, Kasib do not)
				// Filter for only berries the player owns at least 25
				.filter(b => b.harvestAmount > 1 && farming.berryList[b.type]() >= 25);

			if (validBerries.length <= 0) {
				return null;
			}

			// Choose the berry which dies the fastest
			let chosenBerry = validBerries.reduce(fastestDeath);
			return BerryType[chosenBerry.type];
		},

		/**
		 * Find a berry best for farming parasitic berries (mostly Kebia).
		 * Must have enough of a stock of them that we don't need to worry about losing them all.
		 * Must reach taller growth stage in 10 minutes (Kebia's time to maturity)
		 *
		 * @return {string|null} - Name of a berry to farm, or null if there are no suitable berries.
		 */
		getParasiteBait() {
			const farming = App.game.farming;

			let validBerries = farming.berryData
				// Only take berries which yield more from harvesting (eg. Lum does not)
				// Only take berries which reach 'taller' stage in 10 minutes
				.filter(b => b.harvestAmount > 1 && b.growthTime[GROWTH_STAGE_TALLER] <= 10 * 60)

				// Filter for only berries the player owns
				.map(b => ({data: b, amt: farming.berryList[b.type]()}))
				.filter(o => o.amt > 25);

			if (validBerries.length <= 0) {
				return null;
			}

			// Choose the berry the player owns the fewest of
			let chosenBerry = validBerries.reduce((a, b) => a.amt < b.amt? a : b);
			return BerryType[chosenBerry.data.type];
		},

		/**
		 * Look up how many of the given berry the player owns.
		 *
		 * @param name {string} - Name of the berry to look up.
		 * @return     {number} - Number of that type of berry owned.
		 */
		getBerryAmount(name) {
			const id = this._lookupBerry(name);
			return App.game.farming.berryList[id]();
		},

		/**
		 * Check if the player currently has a farm point quest active.
		 *
		 * @return - Truthy if the player does have a farm point quest active, falsey otherwise.
		 */
		hasFarmPointQuest() {
			return App.game.quests.currentQuests()
				.some(q => q instanceof GainFarmPointsQuest && !q.isCompleted());
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

		/**
		 * Not required by interface.
		 * Check if the given berry type is currently on the farm itself.
		 *
		 * @param id {number} - Id of the berry to look up.
		 * @return            - Truthy if the berry is present on the farm. Falsey otherwise.
		 */
		_isBerryIdOnField(id) {
			const farming = this._getFarmingModule();
			if (!farming) {
				return false;
			}

			for (const plot of farming.plotList) {
				if (plot.isUnlocked && plot.berry == id) {
					return true;
				}
			}

			return false;
		},

		/**
		 * Check if the given berry type is currently on the farm itself.
		 *
		 * @param name {string} - Name of the berry to look up.
		 * @return              - Truthy if the berry is present on the farm. Falsey otherwise.
		 */
		isBerryOnField(name) {
			const id = this._lookupBerry(name);
			if (id == null) {
				return false;
			}

			return this._isBerryIdOnField(id);
		},

		/**
		 * Find an evolve-near-flavour-mutation which is eligible and useful to grind for.
		 * Assumes that the mutation may be achieved by simply planting a full field of the parent berry.
		 *
		 * @return {{targetBerry: string, parentBerry: string}} - Object containing the names of the
		 *                                                        target and parent berries. Null if
		 *                                                        there are no suitable mutations.
		 */
		getEligibleFlavourEvolveMutation() {
			const farming = this._getFarmingModule();
			if (!farming) {
				return null;
			}

			mutationLoop: for (const mutation of farming.mutations) {
				if (!(mutation instanceof EvolveNearFlavorMutation)) {
					continue mutationLoop;
				}

				if (farming.berryList[mutation.mutatedBerry]() > 0
						|| this._isBerryIdOnField(mutation.mutatedBerry)) {
					continue mutationLoop;
				}

				if (farming.berryList[mutation.originalBerry]() < 26) {
					continue mutationLoop;
				}

				// originalBerry's flavours * 8 fall within the range specified by the mutation
				const parentBerry = farming.berryData[mutation.originalBerry];
				for (let i = 0; i < mutation.flavorReqs.length; ++i) {
					const [min, max] = mutation.flavorReqs[i];
					const berryFlavour = parentBerry.flavors[i].value * 8;

					if (berryFlavour < min || berryFlavour > max) {
						continue mutationLoop;
					}
				}

				return {
					targetBerry: this._lookupBerry(mutation.mutatedBerry),
					parentBerry: this._lookupBerry(mutation.originalBerry),
				};
			}

			return null;
		},

		/**
		 * Find an evolve-near-berry mutation which is
		 * eligible and useful to grind for.
		 * Will only return mutations which use a single catalyst berry.
		 *
		 * @return {{
		 *   targetBerry: string,   - Name of berry produced by this mutation.
		 *   parentBerry: string,   - Name of berry mutated in this mutation.
		 *   catalystBerry: string, - Name of berry which must be next to the parent berry.
		 * } | null}                - Object containing info about the mutation, or null if there are none.
		 */
		getEligibleEvolveNearBerryMutation() {
			const farming = this._getFarmingModule();
			if (!farming) {
				return null;
			}

			for (const mutation of farming.mutations) {
				if (!(mutation instanceof EvolveNearBerryMutation)) {
					continue;
				}

				// Exclude parasite mutations,
				// a subclass of EvolveNearBerryMutation
				if (mutation instanceof ParasiteMutation) {
					continue;
				}

				// Skip mutations for berries we've already unlocked
				if (farming.berryList[mutation.mutatedBerry]() > 0
						|| this._isBerryIdOnField(mutation.mutatedBerry)) {
					continue;
				}

				// Filter for mutations which only require a single catalyst
				if (mutation.berryReqs.length != 1) {
					continue;
				}

				const catalystBerry = mutation.berryReqs[0];

				// Skip mutations which we don't have the ingredients for
				if (farming.berryList[mutation.originalBerry]() < 26
						|| farming.berryList[catalystBerry]() < 26) {
					continue;
				}

				return {
					targetBerry: this._lookupBerry(mutation.mutatedBerry),
					parentBerry: this._lookupBerry(mutation.originalBerry),
					catalystBerry: this._lookupBerry(catalystBerry),
				};
			}

			return null;
		},

		/**
		 * Find a grow-near-berry mutation which is eligible and useful to grind for.
		 * These mutations are achieved by surrounding an empty
		 * plot with at least one of each of the parent berries.
		 * Currently, this filters to mutations which require 4 or fewer parent berry species.
		 *
		 * @return {{targetBerry: string, parentBerries: string[]}} - Object containing the names of the
		 *                                                            target and parent berries. Null if
		 *                                                            there are no suitable mutations.
		 */
		getEligibleGrowNearBerryMutation() {
			const farming = this._getFarmingModule();
			if (!farming) {
				return null;
			}

			// Filter for mutations of the right type...
			const mutation = farming.mutations.find(m => m instanceof GrowNearBerryMutation

					// And which we've actually unlocked
					&& m.unlocked

					// And which require 8 or fewer parent berries...
					&& m.berryReqs.length <= 8

					// And which we haven't already done...
					&& farming.berryList[m.mutatedBerry]() == 0
					&& !this._isBerryIdOnField(m.mutatedBerry)

					// And which we have enough of the parent berries
					&& m.berryReqs.every(b => farming.berryList[b]() > 25));

			if (!mutation) {
				return null;
			}

			return {
				targetBerry: this._lookupBerry(mutation.mutatedBerry),
				parentBerries: mutation.berryReqs.map(id => this._lookupBerry(id)),
			};
		},

		/**
		 * Find a grow-near-flavour mutation which may be fulfilled
		 * using three of a single parent berry type.
		 */
		getEligibleGrowNearFlavourMutation() {
			const farming = this._getFarmingModule();
			if (!farming) {
				return null;
			}

			for (const mutation of farming.mutations) {
				// Filter for the correct type
				if (!(mutation instanceof GrowNearFlavorMutation)) {
					continue;
				}

				// Check we haven't already got the target berry
				if (farming.berryList[mutation.mutatedBerry]() > 0
						|| this._isBerryIdOnField(mutation.mutatedBerry)) {
					continue;
				}

				// originalBerry's flavours * 8 fall within the range specified by the mutation
				berryLoop: for (const parentBerry of farming.berryData) {
					for (let i = 0; i < mutation.flavorReqs.length; ++i) {
						const [min, max] = mutation.flavorReqs[i];
						const berryFlavour = parentBerry.flavors[i].value * 8;

						if (berryFlavour < min || berryFlavour > max) {
							continue berryLoop;
						}
					}

					return {
						targetBerry: this._lookupBerry(mutation.mutatedBerry),
						parentBerry: this._lookupBerry(parentBerry.type),
					};
				}
			}

			return null;
		},

		/**
		 * Find a berry which may be usefully mutated by
		 * growing it alone with no other plants near it.
		 *
		 * @return {{
		 *   targetBerry: string,
		 *   parentBerry: string
		 * }} - Object containing the names of the target and parent
		 *      berries. Null if there are no suitable mutations.
		 */
		getEligibleAloneMutation() {
			const farming = this._getFarmingModule();
			if (!farming) {
				return null;
			}

			// Filter for mutations of the right type...
			const mutation = farming.mutations.find(m => m instanceof EvolveNearBerryStrictMutation

					// And which require no berrys to surround them...
					&& Object.keys(m.berryReqs).length == 0

					// And which we haven't already done...
					&& farming.berryList[m.mutatedBerry]() == 0
					&& !this._isBerryIdOnField(m.mutatedBerry)

					// And which we have enough of the parent berry
					&& farming.berryList[m.originalBerry]() > 9);

			if (!mutation) {
				return null;
			}

			return {
				targetBerry: this._lookupBerry(mutation.mutatedBerry),
				parentBerry: this._lookupBerry(mutation.originalBerry),
			};
		},

		/**
		 * Find a berry which may be usefully mutated by growing 8 of another berry around an empty plot.
		 *
		 * @return {{
		 *   targetBerry: string,
		 *   parentBerry: string
		 * }} - Object containing the names of the target and parent
		 *      berries. Null if there are no suitable mutations.
		 */
		getEligibleSurroundMutation() {
			const farming = this._getFarmingModule();
			if (!farming) {
				return null;
			}

			const mutation = farming.mutations.find(m => {
					// Filter for mutations of the right type...
					if (!(m instanceof GrowNearBerryStrictMutation)) {
						return false;
					}

					// And which require 8 of one berry type...
					const parents = Object.entries(m.berryReqs);
					return parents.length == 1
						&& parents[0][1] == 8

						// And which we haven't already done...
						&& farming.berryList[m.mutatedBerry]() == 0
						&& !this._isBerryIdOnField(m.mutatedBerry)

						// And which we have enough of the parent berry
						&& farming.berryList[+parents[0][0]]() > 21;
				});

			if (!mutation) {
				return null;
			}

			return {
				targetBerry: this._lookupBerry(mutation.mutatedBerry),
				parentBerry: this._lookupBerry(Object.keys(mutation.berryReqs)[0]),
			};
		},

		/**
		 * Find a berry which may be usefully mutated by several of another berry anywhere in the field.
		 *
		 * @return {{
		 *   targetBerry: string,
		 *   parentBerry: string,
		 *   amount: number,
		 * }} - Object containing the names of the target and parent
		 *      berries, and the number of parent berries required for the mutation.
		 *      Null if there are no suitable mutations.
		 */
		getEligibleFieldFlavourMutation() {
			const farming = this._getFarmingModule();
			if (!farming) {
				return null;
			}

			for (const m of farming.mutations) {
				// Filter for mutations of the right type...
				if (!(m instanceof FieldFlavorMutation)) {
					continue;
				}

				// And which we've unlocked...
				if (!m.unlocked) {
					continue;
				}

				// And which we haven't already done...
				if (farming.berryList[m.mutatedBerry]() > 0
						|| this._isBerryIdOnField(m.mutatedBerry)) {
					continue;
				}

				// Get the required flavours assuming all berries are fully grown
				const flavourReqs = m.fieldFlavor.map(
						(f, i) => f / m.flavorRatio[i]);

				// Check if the given amount of berries is enough
				// to satisfy the flavour requirements
				function checkFlavours(berry, amt) {
					for (let i = 0; i < flavourReqs.length; ++i) {
						if (berry.flavors[i] * amt < flavourReqs[i]) {
							return false;
						}
					}

					return true;
				}

				// Find a suitable berry to use as a parent berry
				for (const parentBerry of farming.berryData) {
					let amount = PAGE_PLOT_COUNT - 1;
					if (!checkFlavours(parentBerry, amount)) {
						continue;
					}

					// Repeat to see how many berries are actually needed
					while (checkFlavours(parentBerry, amount - 1)) {
						amount -= 1;
					}

					return {
						targetBerry: this._lookupBerry(m.mutatedBerry),
						parentBerry: this._lookupBerry(parentBerry.type),
						amount,
					};
				}
			}

			return null;
		},

		/**
		 * Check if the player has unlocked all plots in the farm.
		 *
		 * @return - Truthy if all plots are unlocked. Falsey if not.
		 */
		allPlotsUnlocked() {
			return this._getFarmingModule().unlockedPlotCount() >= PAGE_PLOT_COUNT;
		},

		/**
		 * Check if the player has unlocked the given plot.
		 *
		 * @param plotIdx {number} - Index of the plot to check.
		 * @return                 - Truthy if the plot is unlocked. Falsey if not.
		 */
		plotUnlocked(plotIdx) {
			return this._getFarmingModule().plotList[plotIdx].isUnlocked;
		},

		/**
		 * Check what the unlock requirement for the given plot is.
		 *
		 * @param plotIdx {number}                          - Index of the plot to check.
		 * @return        {{berry: string, amount: number}} - Object containing the name and amount of
		 *                                                    the berry needed to unlock the plot.
		 */
		getPlotUnlockCost(plotIdx) {
			const req = this._getFarmingModule().plotBerryCost(plotIdx);

			return {
				berry: this._lookupBerry(req.type),
				amount: req.amount,
			};
		},

		/**
		 * Attempt to unlock the given plot.
		 *
		 * @param plotIdx {number} - Index of the plot to unlock.
		 */
		unlockPlot(plotIdx) {
			this._getFarmingModule().unlockPlot(plotIdx);
		},
	};

	//////////////////////////

	/*
	 * The main functionality of the script should go here.
	 *
	 * Any interaction with the page should only be done
	 * through the page interface defined above.
	 */

	const WINDOW_KEY = "fh";

	// Maximum task length in minutes
	const MAX_TASK_LENGTH = 60;
	const TASK_LENGTH_REGION_BONUS = 60;

	const DELAY_HARVEST    =       300;
	const DELAY_PLANT      =       300;
	const DELAY_IDLE       =  8 * 1000;
	const DELAY_TASK_START =  3 * 1000;
	const DELAY_NO_TASK    = 60 * 1000;

	// The script will attempt to keep all farmable berries above this threshold.
	const DESIRED_BERRY_AMOUNT = 1000;

	// Task priorities. Higher is more important
	const PRIORITY_USER                   = 10; // Anything initiated by the user.
	const PRIORITY_PLOT_UNLOCK            =  7;
	const PRIORITY_PLOT_UNLOCK_FARM_BERRY =  6;
	const PRIORITY_BERRY_QUEST            =  5;
	const PRIORITY_POINT_QUEST            =  4;
	const PRIORITY_MUTATION               =  3; // Farming to unlock new types of berries
	const PRIORITY_AMOUNT                 =  2; // Farming to get more of already unlocked berries
	const PRIORITY_CLEAN_UP               =  1;
	const PRIORITY_NOTHING                =  0;

	// Max maturation time in seconds to allow for a berry chosen to farm during a Farm Point quest
	const POINT_QUEST_MAX_MATURATION = 15 * 60;

	// List of all plot ids in the farm.
	const allPlots = Array(PAGE_PLOT_COUNT).fill(null).map((x, i) => i);

	const SINGLE_PARENT_GROW_MUTATION_LAYOUTS = [];

	// Layout in which index 0 plants are fully surrounded by index 1 plants
	// Used for farming parasitic Kebia berries, as well as certain mutations
	const SURROUND_LAYOUT = SINGLE_PARENT_GROW_MUTATION_LAYOUTS[8] = convertMutationLayout([
		1, 1, 1, 1, 1,
		1, 0, 1, 0, 1,
		1, 1, 1, 1, 1,
		1, 0, 1, 0, 1,
		1, 1, 1, 1, 1,
	]);

	/**
	 * Layout for grow mutations requiring 3 of a single parent berry type.
	 */
	SINGLE_PARENT_GROW_MUTATION_LAYOUTS[3] = convertMutationLayout([
		0, 1, 0, 0, 1,
		1, 1, 0, 1, 1,
		0, 0, 0, 0, 0,
		0, 1, 0, 0, 1,
		1, 1, 0, 1, 1,
	]);

	// Layouts used when farming for grow mutations.
	// Indexed by the number of parent berries involved in the mutation.
	const GROW_MUTATION_LAYOUTS = [];

	GROW_MUTATION_LAYOUTS[2] = [
		 0, -1, -1,  0, -1,
		-1,  1, -1, -1,  1,
		-1, -1, -1, -1, -1,
		 0, -1, -1,  0, -1,
		-1,  1, -1, -1,  1,
	];

	GROW_MUTATION_LAYOUTS[3] = [
		 0,  1, -1,  0,  1,
		 2, -1, -1,  2, -1,
		-1, -1, -1, -1, -1,
		 0,  1, -1,  0,  1,
		 2, -1, -1,  2, -1,
	];

	GROW_MUTATION_LAYOUTS[4] = [
		 0, -1,  1, -1,  0,
		 2, -1,  3, -1,  2,
		-1, -1, -1, -1, -1,
		 1, -1,  0, -1,  1,
		 3, -1,  2, -1,  3,
	];

	GROW_MUTATION_LAYOUTS[7] = [
		4, -1,  6, -1,  4,
		3, -1,  5, -1,  3,
		2,  1,  0,  1,  2,
		3, -1,  5, -1,  3,
		4, -1,  6, -1,  4,
	];

	GROW_MUTATION_LAYOUTS[8] = [
		0,  1,  3,  1,  0,
		2, -1,  5, -1,  2,
		4,  6,  7,  6,  4,
		2, -1,  5, -1,  2,
		0,  1,  3,  1,  0,
	];

	// Reformat the above layouts into one which may
	// be more easily used by the planting code.
	//
	// GROW_MUTATION_PLOTS[parentBerryCount][berryIndex] -> list of plot indices
	const GROW_MUTATION_PLOTS = GROW_MUTATION_LAYOUTS.map(convertMutationLayout);

	// Specialised layout for mutating Haban berries to avoid letting the
	// Occa berry used in the recipe spread to other berries.
	const HABAN_MUTATION_LAYOUT = convertMutationLayout([
		-1,  3,  0,  2, -1,
		 2, -1, -1, -1,  3,
		 0, -1,  1, -1,  0,
		 3, -1, -1, -1,  2,
		-1,  2,  0,  3, -1,
	]);

	/**
	 * Layout for growing 9 plants completely isolated from each other.
	 */
	const ALONE_LAYOUT = convertMutationLayout([
		 0,  1,  0,  1,  0,
		 1,  1,  1,  1,  1,
		 0,  1,  0,  1,  0,
		 1,  1,  1,  1,  1,
		 0,  1,  0,  1,  0,
	]);

	/**
	 * Layout to use when farming any berry accelerated by Wacans.
	 * The target berry goes in index 0, Wacans go in index 1.
	 */
	const WACAN_LAYOUT = convertMutationLayout([
		0, 0, 0, 0, 0,
		1, 1, 1, 1, 1,
		0, 0, 0, 0, 0,
		1, 1, 1, 1, 1,
		0, 0, 0, 0, 0,
	]);

	/**
	 * Layout for evolve-near-berry mutations.
	 * The parent berry goes in slots labelled 0,
	 * and the catalyst berries go in slots labelled 1.
	 */
	const EVOLVE_NEAR_BERRY_LAYOUT = convertMutationLayout([
		0, 0, 0, 0, 0,
		0, 1, 0, 0, 1,
		0, 0, 0, 0, 0,
		0, 0, 0, 0, 0,
		0, 1, 0, 0, 1,
	]);

	/**
	 * List of grow mutations which we attempt but don't
	 * try to deduce them from the code.
	 */
	const HARD_CODED_GROW_MUTATIONS = [
		{target: "Qualot", parents: ["Pinap", "Mago"]},
		{target: "Hondew", parents: ["Aguav", "Figy", "Wiki"]},
		{target: "Rindo",  parents: ["Cheri", "Aguav"]},
		{target: "Coba",   parents: ["Aguav", "Wiki"]},
	];

	/**
	 * Converts a mutation layout from the readable format found in the
	 * source code to a more useful form which the planting code uses.
	 *
	 * Input format:
	 * format[plotIndex] -> berryIndex
	 *
	 * Output format:
	 * plots[berryIndex] -> list of plot indices
	 */
	function convertMutationLayout(layout) {
		const parentBerryCount = Math.max(...layout) + 1;

		return Array(parentBerryCount).fill()
			.map((_, berry) =>
				convertLayout(layout, berry));
	}

	/**
	 * Find a list of locations of a specific plot index in a layout.
	 */
	function convertLayout(layout, berry=0) {
		return (layout
			.map((plotBerry, plotIdx) =>
				({plotBerry, plotIdx}))
			.filter(o => o.plotBerry == berry)
			.map(o => o.plotIdx));
	}

	function toTitleCase(str) {
		return str[0].toUpperCase() + str.slice(1).toLowerCase();
	}

	function harvestPlot(plotIdx) {
		if (page.harvestPlotIfReady(plotIdx)) {
			managedPlots[plotIdx] = false;
			return true;
		}

		return false;
	}

	/**
	 * Attempt to harvest a ripe berry in any slot.
	 *
	 * Options:
	 *  - exceptBerries {string[]} - List of names of berries to avoid harvesting.
	 *  - onlyBerries   {string[]} - List of names of berries to harvest.
	 *  - plots         {number[]} - List of plot ids to harvest from. If omitted, all plots may be harvested.
	 *  - force         {boolean}  - True to use a shovel to remove the plant if it's not fully grown.
	 *
	 * @param options {Object} - List of options to configure which plots and berries may be harvested.
	 * @return        {number} - Plot id which was harvested, or null if unsuccessful.
	 */
	function harvestOne(options={}) {
		const exceptBerries = options.exceptBerries || [];

		const plots = options.plots || allPlots;

		for (const i of plots) {
			const berry = page.getBerryInPlot(i);

			if (exceptBerries.includes(berry)
					|| (options.onlyBerries && !options.onlyBerries.includes(berry))) {
				continue;
			}

			if (typeof options.minHarvestAmount == "number"
					&& page.getPlotHarvestAmount(i) < options.minHarvestAmount) {
				continue;
			}

			if (harvestPlot(i) || (options.force && page.forceRemovePlot(i))) {
				return i;
			}
		}

		return null;
	}

	/**
	 * Attempt to plant a berry in any available slot.
	 *
	 * @param berryName {string}   - Name of berry to attempt to plant.
	 * @param plots     {number[]} - List of plot ids to plant in. If omitted, all plots may be harvested.
	 * @return          {number}   - Plot id which was planted in, or null if unsuccessful.
	 */
	function plantOne(berryName, plots=allPlots) {
		for (const i of plots) {
			if (page.attemptPlantBerry(i, berryName)) {
				return i;
			}
		}

		return null;
	}

	// Keep track of which plots are being managed by the script.
	let managedPlots = new Array(PAGE_PLOT_COUNT).fill(false);

	/**
	 * Farming task which attempts to farm as much as possible of a given berry type.
	 * Expires at a set point in time.
	 */
	class FarmingTask {
		priority = PRIORITY_USER;

		/**
		 * Create a farming task.
		 *
		 * @param expiration  {Date|number} - Time when the task will expire.
		 * @param targetBerry {string}      - Name of berry to plant.
		 */
		constructor(expiration, targetBerry) {
			this.expiration = expiration;
			this.targetBerry = targetBerry;
		}

		hasExpired(now=new Date()) {
			return now >= this.expiration;
		}

		expire() {
			return new CleanUpTask();
		}

		getTargetBerry() {
			return this.targetBerry || page.getBestFarmingBerry();
		}

		performAction() {
			const targetBerry = this.getTargetBerry();
			const plantingPhases = [];
			const harvestingPhases = [];
			const useWacans = targetBerry != "Wacan" && page.getBerryAmount("Wacan") > 10;

			switch (targetBerry) {
				// Kasibs may only be farmed by allowing other berries to die.
				case "Kasib": {
					const plantBerry = page.getFastestBerry();

					if (useWacans) {
						plantingPhases.push({
							berry: plantBerry,
							plots: WACAN_LAYOUT[0],
						}, {
							berry: "Wacan",
							plots: WACAN_LAYOUT[1],
						});
						harvestingPhases.push({
							exceptBerries: [plantBerry, "Wacan"],
						});
					} else {
						plantingPhases.push({
							berry: plantBerry,
						});
						harvestingPhases.push({
							exceptBerries: [plantBerry],
						});
					}
					break;
				}

				// Kebias are parasitic, and may only be farmed by allowing them to overtake other berries.
				case "Kebia":
					// Attempt to plant seed kebias
					harvestingPhases.push({
						exceptBerries: ["Kebia"],
						plots: SURROUND_LAYOUT[0],
					});

					plantingPhases.push({
						berry: targetBerry,
						plots: SURROUND_LAYOUT[0],
					},

					// Other slots may be filled
					// with any other berry.
					{
						berry: page.getParasiteBait(),
					});

					// Harvest only the Kebias which have overtaken other plants
					// Kasibs are also harvested since they cause out "bait" plants
					// to die faster reducing the overall mutation rate.
					harvestingPhases.push({
						onlyBerries: ["Kebia", "Kasib"],
						plots: SURROUND_LAYOUT[1],
					});

					break;

				// Other berries may be farmed simply by planting and reharvesting them.
				default:
					const usePassho = page.getBerryHarvestAmount(targetBerry) <= 1;

					if (usePassho) {
						plantingPhases.push({
							berry: "Passho",
							plots: SURROUND_LAYOUT[1],
						}, {
							berry: targetBerry,
							plots: SURROUND_LAYOUT[0],
						});
						harvestingPhases.push({
							exceptBerries: ["Passho"],
							plots: SURROUND_LAYOUT[1],
						}, {
							exceptBerries: [targetBerry],
							plots: SURROUND_LAYOUT[0],
						}, {
							onlyBerries: [targetBerry],
							plots: SURROUND_LAYOUT[0],
							minHarvestAmount: 2,
						});

					} else if (useWacans) {
						plantingPhases.push({
							berry: targetBerry,
							plots: WACAN_LAYOUT[0],
						}, {
							berry: "Wacan",
							plots: WACAN_LAYOUT[1],
						});
						harvestingPhases.push({
							plots: WACAN_LAYOUT[0],
						}, {
							plots: WACAN_LAYOUT[1],
							exceptBerries: ["Wacan"],
						});
					} else {
						plantingPhases.push({
							berry: targetBerry,
						});
						harvestingPhases.push({});
					}

					break;
			}

			for (const {berry, plots} of plantingPhases) {
				const plantedPlot = plantOne(berry, plots);
				if (plantedPlot != null) {
					managedPlots[plantedPlot] = true;
					return DELAY_PLANT;
				}
			}

			for (const options of harvestingPhases) {
				if (harvestOne(options) != null) {
					return DELAY_HARVEST;
				}
			}

			return DELAY_IDLE;
		}
	}

	// Farming task for ensuring the player has
	// at least (DESIRED_BERRY_AMOUNT) of each unlocked, farmable berry.
	class FarmAmountTask extends FarmingTask {
		priority = PRIORITY_AMOUNT;

		constructor(targetBerry) {
			super(null, targetBerry);
		}

		getTargetBerry() {
			if (["Kebia", "Kasib"].includes(this.targetBerry)) {
				return this.targetBerry;
			}
			if (this.targetBerry
					&& (page.getBerryAmount(this.targetBerry) > 0
						|| ["Kebia", "Kasib"].includes(this.targetBerry))) {
				return this.targetBerry;
			} else {
				return page.getBestFarmingBerry(true);
			}
		}

		getRequiredAmount() {
			return DESIRED_BERRY_AMOUNT;
		}

		hasExpired(unusedNow) {
			return page.getBerryAmount(this.targetBerry) >= this.getRequiredAmount();
		}
	}

	// Farming Task to get enough of a berry to unlock a slot
	class FarmForPlotUnlockTask extends FarmAmountTask {
		priority = PRIORITY_PLOT_UNLOCK_FARM_BERRY;

		constructor(plotIdx) {
			const req = page.getPlotUnlockCost(plotIdx);
			super(req.berry);
			this.plotIdx = plotIdx;
			this.plotBerryCostAmount = req.amount;
		}

		getRequiredAmount() {
			return this.plotBerryCostAmount + PAGE_PLOT_COUNT;
		}

		expire() {
			return makePlotUnlockTask(this.plotIdx);
		}
	}

	/**
	 * Handles completing a "Harvest N xxx berries at the farm" quest.
	 */
	class BerryQuestTask extends FarmingTask {
		priority = PRIORITY_BERRY_QUEST;

		constructor() {
			super(null, null);
		}

		getTargetBerry() {
			return page.getQuestBerry();
		}

		hasExpired(unusedNow) {
			return this.getTargetBerry() == null;
		}
	}

	/**
	 * Handles completing a "Gain N farm points" quest.
	 */
	class FarmPointQuestTask extends FarmingTask {
		priority = PRIORITY_POINT_QUEST;

		constructor() {
			super(null, null);
		}

		getTargetBerry() {
			return page.getBestFarmingBerry(true, POINT_QUEST_MAX_MATURATION);
		}

		hasExpired(unusedNow) {
			return !page.hasFarmPointQuest();
		}
	}

	/**
	 * Task which aims to harvest remaining plants left by another task, and leave any other plots alone.
	 */
	class CleanUpTask {
		priority = PRIORITY_CLEAN_UP;

		/**
		 * Check if the clean-up task has expired.
		 * It expires when all of the plots it is managing have been harvested.
		 */
		hasExpired(now) {
			let expired = true;

			for (let i = 0; i < managedPlots.length; ++i) {
				if (!managedPlots[i]) {
					continue;
				}

				if (page.plotIsEmpty(i)) {
					managedPlots[i] = false;
				} else {
					expired = false;
				}
			}

			return expired;
		}

		performAction() {
			for (let i = 0; i < managedPlots.length; ++i) {
				if (!managedPlots[i]) {
					continue;
				}

				if (page.harvestPlotIfReady(i)) {
					return DELAY_HARVEST;
				}
			}

			return DELAY_IDLE;
		}
	}

	/**
	 * Attempts to produce a mutation which may be achieved by
	 * filling the whole field with a single type of berry.
	 */
	class FullFieldMutationTask {
		priority = PRIORITY_MUTATION;

		constructor(parentBerry, targetBerry) {
			this.parentBerry = parentBerry;
			this.targetBerry = targetBerry;
		}

		hasExpired(unusedNow) {
			return page.getBerryAmount(this.targetBerry) > 0
					|| page.isBerryOnField(this.targetBerry);
		}

		expire() {
			return new CleanUpTask();
		}

		performAction() {
			const plantedPlot = plantOne(this.parentBerry);
			if (plantedPlot != null) {
				return DELAY_PLANT;
			}

			if (harvestOne({exceptBerries: [this.parentBerry]}) != null) {
				return DELAY_HARVEST;
			}

			return DELAY_IDLE;
		}
	}

	/**
	 * Mutation task for mutations which occur when a plant is grown alone.
	 */
	class AloneMutationTask extends FullFieldMutationTask {
		performAction() {
			if (plantOne(this.parentBerry, ALONE_LAYOUT[0]) != null) {
				return DELAY_PLANT;
			}

			if (harvestOne({
						exceptBerries: [this.parentBerry],
						plots: ALONE_LAYOUT[0],
					}) != null || harvestOne({
						plots: ALONE_LAYOUT[1],
					}) != null) {
				return DELAY_HARVEST;
			}

			return DELAY_IDLE;
		}
	}

	/**
	 * Mutation task for mutations which occur when an empty plot is surrounded by N of a single type of berry.
	 */
	class SingleParentGrowMutationTask extends FullFieldMutationTask {
		constructor(parentBerry, targetBerry, parentCount) {
			super(parentBerry, targetBerry);
			this.parentCount = parentCount;

			this.layout = SINGLE_PARENT_GROW_MUTATION_LAYOUTS[parentCount];
			if (!this.layout) {
				throw new Error(`No layout for ${parentCount} berry grow mutations`);
			}
		}

		performAction() {
			if (harvestOne({
						plots: this.layout[0],
					}) != null || harvestOne({
						plots: this.layout[1],
						exceptBerries: [this.parentBerry],
					}) != null || harvestOne({
						plots: this.layout[0],
						onlyBerries: [this.parentBerry],
						force: true,
					}) != null) {
				return DELAY_HARVEST;
			}

			if (plantOne(this.parentBerry, this.layout[1]) != null) {
				return DELAY_PLANT;
			}

			return DELAY_IDLE;
		}
	}

	/**
	 * Class for performing an evolve-near-berry mutation.
	 */
	class EvolveNearBerryTask extends FullFieldMutationTask {
		constructor(targetBerry, parentBerry, catalystBerry) {
			super(parentBerry, targetBerry);
			this.catalystBerry = catalystBerry;
		}

		performAction() {
			if (harvestOne({exceptBerries:
					[this.parentBerry, this.catalystBerry]}) != null) {
				return DELAY_HARVEST;
			}

			const layout = EVOLVE_NEAR_BERRY_LAYOUT;

			if (plantOne(this.parentBerry, layout[0]) != null
					|| plantOne(this.catalystBerry, layout[1]) != null) {
				return DELAY_PLANT;
			}

			return DELAY_IDLE;
		}
	}

	// Count how many of the given berry are on the field
	function countBerries(berry) {
		let count = 0;

		for (let i = 0; i < PAGE_PLOT_COUNT; ++i) {
			if (page.getBerryInPlot(i) == berry) {
				count += 1;
			}
		}

		return count;
	}

	class GenericTask {
		constructor(priority, expirationPolicy, actionPolicy) {
			this.priority = priority;
			this.expirationPolicy = expirationPolicy;
			this.actionPolicy = actionPolicy;
		}

		hasExpired() {
			return this.expirationPolicy.hasExpired();
		}

		performAction() {
			return this.actionPolicy.performAction();
		}

		expire() {
			return this.actionPolicy.afterExpiration?.();
		}
	}

	class PlotUnlockExpiration {
		constructor(plotIdx) {
			this.plotIdx = plotIdx;
		}

		hasExpired() {
			if (page.plotUnlocked(this.plotIdx)) {
				return true;
			}

			// Also expire if we don't have enough berries to buy it
			const req = page.getPlotUnlockCost(this.plotIdx);
			return page.getBerryAmount(req.berry) < req.amount;
		}
	}

	class TimedExpiration {
		constructor(expirationTime) {
			this.expirationTime = expirationTime;
		}

		hasExpired() {
			const now = new Date();
			return +now >= this.expirationTime;
		}
	}

	// Expire when the given berry is unlocked/obtained
	class BerryUnlockExpiration {
		constructor(berry) {
			this.berry = berry;
		}

		hasExpired() {
			return (page.getBerryAmount(this.berry) > 0
					|| page.isBerryOnField(this.berry));
		}
	}

	class PlotUnlockAction {
		constructor(plotIdx) {
			this.plotIdx = plotIdx;
		}

		performAction() {
			page.unlockPlot(this.plotIdx);
			return DELAY_HARVEST;
		}
	}

	// Maintain a full field of the specified berry
	class FullFieldAction {
		constructor(berry) {
			this.berry = berry;
		}

		performAction() {
			const plantedPlot = plantOne(this.berry);
			if (plantedPlot != null) {
				return DELAY_PLANT;
			}

			if (harvestOne({exceptBerries: [this.berry]}) != null) {
				return DELAY_HARVEST;
			}

			// Harvest some if we're running low on the berry in question
			if (page.getBerryAmount(this.berry) < 25
					&& harvestOne({onlyBerries: [this.berry]}) != null) {
				return DELAY_HARVEST;
			}

			return DELAY_IDLE;
		}
	}

	// Maintain a given number of a given berry on the field,
	// without caring about layout
	function FieldBerryCountAction {
		constructor(berry, amount) {
			this.berry = berry;
			this.amount = amount;
		}

		performAction() {
			// Plant one if there aren't enough
			if (countBerries(this.berry) < this.amount
					&& plantOne(this.berry) != null) {
				return DELAY_PLANT;
			}

			// Harvest anything else
			if (harvestOne({exceptBerries: [this.berry]}) != null) {
				return DELAY_HARVEST;
			}

			return DELAY_IDLE;
		}
	}

	function makePlotUnlockTask(plotIdx) {
		return new GenericTask(PRIORITY_PLOT_UNLOCK,
				new PlotUnlockExpiration(plotIdx),
				new PlotUnlockAction(plotIdx));
	}

	function makeUserWanderTask(berry, expiration) {
		return new GenericTask(PRIORITY_USER,
				new TimedExpiration(expiration),
				new FullFieldAction(berry));
	}

	function makeFieldMutationTask(targetBerry, parentBerry, amount) {
		return new GenericTask(PRIORITY_MUTATION,
				new BerryUnlockExpiration(targetBerry),
				new FieldBerryCountAction(parentBerry, amount));
	}

	/**
	 * Manages information about a berry in its role as a parent to a mutated berry.
	 */
	class ParentBerry {
		/**
		 * Create a parent berry object.
		 *
		 * @param name {string} - Name of this berry.
		 */
		constructor(name) {
			this.name = name;

			this.maturityAge = page.getBerryMaturityAge(name);
			this.deathAge = page.getBerryDeathAge(name);
		}

		/**
		 * Calculate the earliest time within a slower berry's lifecycle when
		 * this berry should be planted to allow mutations between the two.
		 */
		getMinPlantingAge(olderBerry) {
			return olderBerry.maturityAge - this.maturityAge;
		}

		/**
		 * Calculate the latest time within a slower berry's lifecycle when
		 * this berry should be planted to allow mutations between the two.
		 */
		getMaxPlantingAge(olderBerry) {
			return olderBerry.deathAge - this.maturityAge;
		}
	}

	// Values used by MutationLayoutMap objects.
	const PLOT_EMPTY = -1;
	const PLOT_UNAVAILABLE = -2;

	/**
	 * Holds information about the state of the farm for mutation purposes.
	 */
	class MutationLayoutMap {
		constructor() {
			// Values in this list of plots may be:
			// PLOT_EMPTY - if nothing is planted
			// PLOT_UNAVAILABLE - if the plot contains an unhelpful plant,
			//                    or is not unlocked.
			// A non-negative index - if the plot contains one of the older berries
			//                        in the mutation recipe at a relevant
			//                        stage in its lifecycle.
			this.plots = new Array(PAGE_PLOT_COUNT).fill(PLOT_EMPTY);
		}

		/**
		 * Create and populate a layout map using the specified berries, and real
		 */
		static fromFarm(berry, olderBerries) {
			const layout = new MutationLayoutMap();

			for (let i = 0; i < layout.plots.length; ++i) {
				const berryName = page.getBerryInPlot(i);
				if (!berryName) {
					continue;
				}
				
				if (berryName == berry.name) {
					layout.plots[i] = olderBerries.length;
					continue;
				}

				const matchingOldIdx = olderBerries.findIndex(b => b.name == berryName);
				if (matchingOldIdx >= 0) {
					const matchingOldBerry = olderBerries[matchingOldIdx];
					const age = page.getPlotAge(i);
					if (age >= berry.getMinPlantingAge(matchingOldBerry)
							&& age < berry.getMaxPlantingAge(matchingOldBerry)) {
						layout.plots[i] = matchingOldIdx;
					} else {
						layout.plots[i] = PLOT_UNAVAILABLE;
					}

					continue;
				}

				layout.plots[i] = PLOT_UNAVAILABLE;
			}

			return layout;
		}

		/**
		 * Create a copy of this layout.
		 */
		clone() {
			let layout = new MutationLayoutMap();
			layout.plots = Array.from(this.plots);
			return layout;
		}

		/**
		 * Count how many tiles are adjacent to exactly one of each index.
		 */
		countAdjacentTiles(requiredIdx, centerTile=PLOT_EMPTY) {
			let count = 0;

			for (let i = 0; i < PAGE_PLOT_COUNT; ++i) {
				if (this.plots[i] != centerTile) {
					continue;
				}

				const adjBerries = new Array(requiredIdx + 1).fill(0);
				for (const j of adjacentPlots(i)) {
					let idx = this.plots[j];
					if (idx >= 0 && idx <= requiredIdx) {
						adjBerries[idx] += 1;
					}
				}

				if (adjBerries.every(x => x >= 1)) {
					count += 1;
				}
			}

			return count;
		}
	}

	/**
	 * Generate the ids of the 8 plots surrounding the given plot.
	 */
	function* adjacentPlots(plotId) {
		const leftEdge = plotId % PAGE_FARM_SIZE == 0;
		const rightEdge = plotId % PAGE_FARM_SIZE == PAGE_FARM_SIZE - 1;
		const topEdge = plotId < PAGE_FARM_SIZE;
		const bottomEdge = plotId >= (PAGE_FARM_SIZE * (PAGE_FARM_SIZE - 1))

		function* horizontalPlots(id, excludeCenter=false) {
			if (!leftEdge) {
				yield id - 1;
			}

			if (!excludeCenter) {
				yield id;
			}

			if (!rightEdge) {
				yield id + 1;
			}
		}

		if (!topEdge) {
			yield* horizontalPlots(plotId - PAGE_FARM_SIZE);
		}

		yield* horizontalPlots(plotId, true);

		if (!bottomEdge) {
			yield* horizontalPlots(plotId + PAGE_FARM_SIZE);
		}
	}

	/**
	 * Attempts to mutate using two parent berries.
	 */
	class MutateTask {
		priority = PRIORITY_USER;

		/**
		 * Create a mutation task.
		 *
		 * @param expiration     {Date|number} - Time when the task will expire.
		 * @param parentBerries  {string[]}    - List of names of berries to mutate.
		 * @param evolveStrategy {boolean}     - False for grow-mutations which
		 *                                       appear in empty tiles.
		 *                                       True for evolve-mutations which
		 *                                       appear in place of the
		 *                                       fastest-growing parent berry.
		 */
		constructor(expiration, parentBerries, evolveStrategy=false) {
			this.expiration = expiration;
			this.parentBerries = parentBerries.map(n => new ParentBerry(n))
					// Sort berries by growth rate, slowest first.
					.sort((a, b) => b.maturityAge - a.maturityAge);
			this.evolveStrategy = evolveStrategy;
		}

		hasExpired(now=new Date()) {
			return now >= this.expiration;
		}

		expire() {
			return new CleanUpTask();
		}

		/**
		 * Attempt to harvest berries which are part of the mutation recipe, but due to
		 * timing or positioning, cannot be useful towards producing the mutation.
		 *
		 * @param centerTile {number}  - Index of the parentBerries to expect as the
		 *                               center tile of a valid mutation spot.
		 * @return           {boolean} - True if a berry was harvested, false if not.
		 */
		harvestRedundantMutationBerries() {
			const centerTile = this.evolveStrategy?
					this.parentBerries[this.parentBerries.length - 1]
					: PLOT_EMPTY;

			// Create list of tiles in the farm
			const plots = Array(PAGE_PLOT_COUNT).fill(null).map((_, i) => {
					const name = page.getBerryInPlot(i);
					if (!name) {
						return {idx: PLOT_EMPTY};
					}

					const idx = this.parentBerries.findIndex(b => b.name == name);
					if (idx < 0) {
						return {idx: PLOT_UNAVAILABLE};
					}

					return {idx};
				});

			// Mark each tile as unused by default
			for (const plot of plots) {
				plot.used = false;
			}

			// Check which tiles have potential to produce the mutation, either now or in the future.
			for (let i = 0; i < plots.length; ++i) {
				if (plots[i].idx != centerTile) {
					continue;
				}

				// Find which of the parent berries are present around this plot
				const parentBerriesPresent = this.parentBerries.map(_ => false);
				if (centerTile >= 0) {
					parentBerriesPresent[centerTile] = true;
				}

				for (const adjIdx of adjacentPlots(i)) {
					const berryIdx = plots[adjIdx].idx;
					if (berryIdx >= 0) {
						parentBerriesPresent[berryIdx] = true;
					}
				}

				// Find which of the parent berries near this plot are useful
				parentBerriesPresent.push(false);
				const highestUsefulBerry = parentBerriesPresent.indexOf(false) - 1;
				if (highestUsefulBerry < 0) {
					continue;
				}

				// Mark surrounding tiles as safe from harvesting
				if (plots[i].idx <= highestUsefulBerry) {
					plots[i].used = true;
				}

				for (const adjIdx of adjacentPlots(i)) {
					const berryIdx = plots[adjIdx].idx;
					if (berryIdx >= 0 && berryIdx <= highestUsefulBerry) {
						plots[adjIdx].used = true;
					}
				}
			}

			// Check through the list again and harvest any which are not safe
			for (let i = 0; i < plots.length; ++i) {
				const plot = plots[i];
				if (plot.idx >= 0 && !plot.used && harvestPlot(i)) {
					return true;
				}
			}

			return false;
		}

		/**
		 * Fetch the planting layout to use for this mutation, or undefined if there is no preset layout to use.
		 */
		getPlantingLayout() {
			if (!page.allPlotsUnlocked()) {
				return undefined;
			}

			return GROW_MUTATION_PLOTS[this.parentBerries.length];
		}

		performAction() {
			// Harvest anything other than the parent berries.
			const harvestedPlot = harvestOne({exceptBerries: this.parentBerries.map(b => b.name)});
			if (harvestedPlot != null) {
				return DELAY_HARVEST;
			}

			// Harvest parent berries which don't have the potential to contribute to producing a mutation
			if (this.harvestRedundantMutationBerries()) {
				return DELAY_HARVEST;
			}

			const plantingLayout = this.getPlantingLayout();

			// Harvest or remove any spreading parent berries in the wrong place
			for (let b = 0; b < this.parentBerries.length; ++b) {
				const berry = this.parentBerries[b];
				if (!page.berryCanSpread(berry.name)) {
					continue;
				}

				const berryPlots = plantingLayout[b];

				for (let p = 0; p < PAGE_PLOT_COUNT; ++p) {
					// If the berry is present in this spot, but it shouldn't be, remove it
					if (!berryPlots.includes(p) && page.getBerryInPlot(p) == berry.name) {
						if (page.forceRemovePlot(p)) {
							managedPlots[p] = false;
							return DELAY_HARVEST;
						}
					}
				}
			}

			// Figure out where to usefully place a new parent berry.
			// For each berry, in order of fastest to slowest:
			for (let b = this.parentBerries.length - 1; b >= 0; b--) {
				const berry = this.parentBerries[b];
				const olderBerries = this.parentBerries.slice(0, b);
				const layout = MutationLayoutMap.fromFarm(berry, olderBerries);
				
				// Only place using the evolve strategy on the fastest-growing berry.
				const evolveStrategy = this.evolveStrategy
						&& b == this.parentBerries.length - 1;

				let scoreBefore;
				if (evolveStrategy) {
					scoreBefore = layout.countAdjacentTiles(b - 1, b);
				} else {
					scoreBefore = layout.countAdjacentTiles(b);
				}

				let bestIdx = -1;
				let bestScore = -1;

				// Iterate through places we could possibly place this berry
				let candidatePlots;
				if (plantingLayout) {
					candidatePlots = plantingLayout[b];
				} else {
					candidatePlots = Array(PAGE_PLOT_COUNT).fill().map((x, i) => i);
				}

				for (const p of candidatePlots) {
					if (layout.plots[p] != PLOT_EMPTY) {
						continue;
					}

					// Calculate how many empty tiles would be adjacent
					// to this berry type and all slower berries
					const hypotheticalLayout = layout.clone();
					hypotheticalLayout.plots[p] = b;

					let score;
					if (evolveStrategy) {
						score = hypotheticalLayout.countAdjacentTiles(b - 1, b);
					} else {
						score = hypotheticalLayout.countAdjacentTiles(b);
					}

					score -= scoreBefore;

					if (score > 0 && score > bestScore) {
						bestIdx = p;
						bestScore = score;
					}
				}

				if (bestIdx >= 0) {
					page.attemptPlantBerry(bestIdx, berry.name);
					managedPlots[bestIdx] = true;
					return DELAY_PLANT;
				}
			}

			return DELAY_IDLE;
		}
	}

	/**
	 * Check if the player has any of the given berry, includin on the field.
	 */
	function hasBerry(berryName) {
		return page.getBerryAmount(berryName) > 0
				|| page.isBerryOnField(berryName);
	}

	/**
	 * Handles automatically completing a GrowNearBerryMutation.
	 */
	class GrowNearBerryMutateTask extends MutateTask {
		priority = PRIORITY_MUTATION;

		constructor(parentBerries, targetBerry) {
			super(null, parentBerries, false);
			this.targetBerry = targetBerry;
		}

		getPlantingLayout() {
			if (this.targetBerry == "Haban") {
				return HABAN_MUTATION_LAYOUT;
			}

			return super.getPlantingLayout();
		}

		hasExpired(unusedNow) {
			return hasBerry(this.targetBerry);
		}
	}

	let currentTask = null;

	/**
	 * Assign a new farming task.
	 *
	 * @param duration    {number} - Duration of the task in ms.
	 * @param targetBerry {string} - Name of berry to plant.
	 */
	function setTask(duration, targetBerry) {
		let now = new Date();
		currentTask = new FarmingTask(+now + duration, targetBerry);
		scheduleTick(DELAY_TASK_START);
	}

	let tickTimeoutId = null;

	function scheduleTick(delay) {
		if (tickTimeoutId != null) {
			clearTimeout(tickTimeoutId);
		}

		tickTimeoutId = setTimeout(tick, delay);
	}

	function findEligibleHardCodedMutation() {
		mutationLoop: for (const mutation of HARD_CODED_GROW_MUTATIONS) {
			if (hasBerry(mutation.target)) {
				continue;
			}

			for (const parent of mutation.parents) {
				if (page.getBerryAmount(parent) < PAGE_PLOT_COUNT) {
					continue mutationLoop;
				}
			}

			return mutation;
		}

		return null;
	}

	/**
	 * Check for tasks which can be started automatically.
	 */
	function autoStartTasks() {
		let priority = currentTask? currentTask.priority : PRIORITY_NOTHING;

		if (priority < Math.min(PRIORITY_PLOT_UNLOCK, PRIORITY_PLOT_UNLOCK_FARM_BERRY)
				&& !page.allPlotsUnlocked()) {
			for (let i = 0; i < PAGE_PLOT_COUNT; ++i) {
				if (page.plotUnlocked(i)) {
					continue;
				}

				const req = page.getPlotUnlockCost(i);
				const berryOwnedAmt = page.getBerryAmount(req.berry);
				if (berryOwnedAmt >= req.amount + 1) {
					console.log("Unlocking plot", i);
					currentTask = makePlotUnlockTask(i);
					priority = currentTask.priority;
					break;
				} else if (berryOwnedAmt > 0) {
					console.log("Farming", req.berry, "to unlock plot", i);
					currentTask = new FarmForPlotUnlockTask(i);
					priority = currentTask.priority;
					break;
				}
			}
		}

		if (priority < PRIORITY_BERRY_QUEST && page.getQuestBerry()) {
			console.log("Farming for Berry quest");
			currentTask = new BerryQuestTask();
			priority = currentTask.priority;
		}

		if (priority < PRIORITY_POINT_QUEST && page.hasFarmPointQuest()) {
			console.log("Farming for Farm Point quest");
			currentTask = new FarmPointQuestTask();
			priority = currentTask.priority;
		}

		if (priority < PRIORITY_AMOUNT) {
			const farmBerry = page.getBestFarmingBerry();
			if (page.getBerryAmount(farmBerry) < DESIRED_BERRY_AMOUNT) {
				console.log("Farming for more", farmBerry);
				currentTask = new FarmAmountTask(farmBerry);
				priority = currentTask.priority;
			}
		}

		mutationTasks: if (priority < PRIORITY_MUTATION) {
			const flavourEvolve = page.getEligibleFlavourEvolveMutation();
			if (flavourEvolve) {
				console.log("Farming to evolve", flavourEvolve.parentBerry, "into", flavourEvolve.targetBerry);
				currentTask = new FullFieldMutationTask(flavourEvolve.parentBerry, flavourEvolve.targetBerry);
				priority = currentTask.priority;
				break mutationTasks;
			}

			const growNearBerry = page.getEligibleGrowNearBerryMutation();
			if (growNearBerry) {
				console.log("Farming to grow", growNearBerry.parentBerries.join(", "),
						"into", growNearBerry.targetBerry);
				currentTask = new GrowNearBerryMutateTask(
						growNearBerry.parentBerries, growNearBerry.targetBerry);
				priority = currentTask.priority;
				break mutationTasks;
			}

			const aloneMutation = page.getEligibleAloneMutation();
			if (aloneMutation) {
				console.log("Farming to grow", aloneMutation.parentBerry,
						"into", aloneMutation.targetBerry);
				currentTask = new AloneMutationTask(
						aloneMutation.parentBerry, aloneMutation.targetBerry);
				priority = currentTask.priority;
				break mutationTasks;
			}

			const surroundMutation = page.getEligibleSurroundMutation();
			if (surroundMutation) {
				console.log("Farming to grow", surroundMutation.parentBerry,
						"into", surroundMutation.targetBerry);
				currentTask = new SingleParentGrowMutationTask(
						surroundMutation.parentBerry, surroundMutation.targetBerry, 8);
				priority = currentTask.priority;
				break mutationTasks;
			}

			const growNearFlavourMutation = page.getEligibleGrowNearFlavourMutation();
			if (growNearFlavourMutation) {
				console.log("Farming to grow", growNearFlavourMutation.parentBerry,
						"into", growNearFlavourMutation.targetBerry);
				currentTask = new SingleParentGrowMutationTask(
						growNearFlavourMutation.parentBerry, growNearFlavourMutation.targetBerry, 3);
				priority = currentTask.priority;
				break mutationTasks;
			}

			const hardCodedMutation = findEligibleHardCodedMutation();
			if (hardCodedMutation) {
				console.log("Farming to grow",
						hardCodedMutation.parents.join(", "), "into",
						hardCodedMutation.target);
				currentTask = new GrowNearBerryMutateTask(
						hardCodedMutation.parents, hardCodedMutation.target);
				priority = currentTask.priority;
				break mutationTasks;
			}

			const evolveNearBerryMutation = page.getEligibleEvolveNearBerryMutation();
			if (evolveNearBerryMutation) {
				console.log("Farming to grow", evolveNearBerryMutation.parentBerry,
						"and", evolveNearBerryMutation.catalystBerry,
						"into", evolveNearBerryMutation.targetBerry);
				currentTask = new EvolveNearBerryTask(
						evolveNearBerryMutation.targetBerry,
						evolveNearBerryMutation.parentBerry,
						evolveNearBerryMutation.catalystBerry);
				priority = currentTask.priority;
				break mutationTasks;
			}

			const fieldFlavourMutation = page.getEligibleFieldFlavourMutation();
			if (fieldFlavourMutation) {
				console.log("Farming to grow",
					fieldFlavourMutation.amount,
					fieldFlavourMutation.parentBerry, "into",
					fieldFlavourMutation.targetBerry);
				currentTask = makeFieldMutationTask(
					fieldFlavourMutation.targetBerry,
					fieldFlavourMutation.parentBerry,
					fieldFlavourMutation.amount);
				priority = currentTask.priority;
				break mutationTasks;
			}
		}
	}

	function tick() {
		if (!page.canAccess()) {
			return scheduleTick(DELAY_IDLE);
		}

		if (currentTask && currentTask.hasExpired()) {
			console.log("Farming task has expired");
			currentTask = currentTask.expire? currentTask.expire() : null;
		}

		autoStartTasks();

		if (!currentTask) {
			return scheduleTick(DELAY_NO_TASK);
		}

		let delay = currentTask.performAction();
		if (delay == null) {
			delay = DELAY_IDLE;
		}
		scheduleTick(delay);
	}

	/**
	 * User facing command.
	 * Set a new farming task.
	 *
	 * @param targetBerry {string|number} - Name or id of the BerryType to use.
	 *                                      Empty string or null to not plant any berries.
	 * @param minutes     {number}        - Number of minutes the task will be active for.
	 */
	function cmdStart(targetBerry, minutes=Infinity) {
		if (targetBerry == "") {
			targetBerry = null;

		} else if (typeof targetBerry == "string") {
			targetBerry = toTitleCase(targetBerry);

			if (!page.berryExists(targetBerry)) {
				throw new Error(targetBerry + " is not a known berry");
			}

		} else if (typeof targetBerry == "number") {
			let berryName = page.berryNameFromId(targetBerry);
			if (berryName == null) {
				throw new Error(`Berry id ${targetBerry} does not exist`);
			}

			targetBerry = berryName;

		} else if (targetBerry != null) {
			throw new Error("Target berry must be passed as either a string or numeric id");
		}

		if (targetBerry && !page.hasUnlockedBerry(targetBerry)) {
			throw new Error(`You have not yet unlocked ${targetBerry}`);
		}

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

		setTask(minutes * 60 * 1000, targetBerry);
		console.log("Farming", targetBerry || "whatever", "for", minutes, "minutes");
	}

	function validateParentBerries(parentBerries) {
		if (!(parentBerries instanceof Array)) {
			throw new Error("parentBerries should be an array of berry names");
		}

		if (parentBerries.length < 1) {
			throw new Error("Must have at least one berry to mutate");
		}

		for (let i = 0; i < parentBerries.length; ++i) {
			const name = parentBerries[i] = toTitleCase(parentBerries[i]);

			if (!page.berryExists(name)) {
					throw new Error(name, " is not a known berry");
			}
		}
	}

	function cmdMutate(parentBerries=[]) {
		validateParentBerries(parentBerries);

		let now = new Date();
		currentTask = new MutateTask(+now + 30 * 60 * 1000, parentBerries);
		scheduleTick(DELAY_TASK_START);
	}

	function cmdEvolve(parentBerries=[]) {
		const DURATION = 3 * 60 * 60 * 1000;

		validateParentBerries(parentBerries);

		let now = new Date();
		currentTask = new MutateTask(+now + DURATION, parentBerries, true);
		scheduleTick(DELAY_TASK_START);
		console.log("Attempting to evolve", parentBerries, "for", DURATION, "ms");
	}

	function cmdWander(berry, minutes=Infinity) {
		const berries = [berry];
		validateParentBerries(berries);
		berry = berries[0];

		const maxLength = MAX_TASK_LENGTH + page.getHighestRegion() * TASK_LENGTH_REGION_BONUS;
		if (minutes > maxLength) {
			minutes = maxLength;
		}

		const now = new Date();
		currentTask = makeUserWanderTask(berry, +now + minutes * 60 * 1000);
		scheduleTick(DELAY_TASK_START);
		console.log("Farming", berry, "for wanderers for", minutes, "minutes");
	}

	(function main() {
		window[WINDOW_KEY] = {
			start: cmdStart,
			mutate: cmdMutate,
			evolve: cmdEvolve,
			wander: cmdWander,
		}

		scheduleTick(DELAY_NO_TASK);
	})();
})();

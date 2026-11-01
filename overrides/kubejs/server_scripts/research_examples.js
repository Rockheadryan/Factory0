ResearchdEvents.registerResearchPacks(event => {
    event.create('rd_examples_js:test_pack')
        .translatableName("research_pack.rd_example_js.test_pack")
        .literalDescription("Testing...")
        .color(120, 150, 90)
        .sortingValue(0);
});

ResearchdEvents.registerResearches(event => {
    event.create('rd_example_js:wood')
        .icon('minecraft:oak_log')
        .literalName("Oak log")
        .method(ResearchMethodHelper.and(
            ResearchMethodHelper.consumeItem('minecraft:wheat_seeds', 1),
            ResearchMethodHelper.consumeItem('minecraft:dirt', 8)
        ))
        .effect(ResearchEffectHelper.unlockRecipe('minecraft:oak_planks'));

    event.create('rd_example_js:iron')
        .icon('minecraft:iron_ingot')
        .translatableDescription("research.rd_example_js.iron_desc")
        .parents('rd_example_js:wood')
        .method(ResearchMethodHelper.or(
            ResearchMethodHelper.consumeItem('minecraft:furnace', 1),
            ResearchMethodHelper.consumeItem('minecraft:cobblestone', 8)
        ))
        .effect(ResearchEffectHelper.unlockRecipe('minecraft:iron_pickaxe'));

    event.create('rd_example_js:nether_dim')
        .icon('minecraft:netherrack')
        .parents('rd_example_js:iron')
        .method(ResearchMethodHelper.consumePack('rd_example_js:test_pack', 50, 20))
        .effect(ResearchEffectHelper.and(
            ResearchEffectHelper.unlockRecipe('minecraft:gold_block'),
            ResearchEffectHelper.unlockRecipe('minecraft:netherite_ingot')
        ));
});


// Small opt-in sample sets; no tick handlers or automatic inventory grants.
const FACTORY0_SOLID_TEST_RESOURCES = ["iron", "copper", "gold", "coal", "quartz", "ancient_debris", "uranium", "sulfur"]
const FACTORY0_FLUID_TEST_RESOURCES = ["water", "lava", "crude_oil", "heavy_oil", "ether_gas", "molten_allthemodium"]

function factory0GiveSolidNodeSamples(player, stage) {
  for (const resource of FACTORY0_SOLID_TEST_RESOURCES) {
    player.give(`kubejs:factory0_${resource}_node_${stage}`)
  }
  player.tell(Text.gray(`Given eight ${stage} resource-node samples.`))
}

ServerEvents.basicCommand('factory0_nodes_pure', event => {
  factory0GiveSolidNodeSamples(event.player, 'pure')
})

ServerEvents.basicCommand('factory0_nodes_normal', event => {
  factory0GiveSolidNodeSamples(event.player, 'normal')
})

ServerEvents.basicCommand('factory0_nodes_impure', event => {
  factory0GiveSolidNodeSamples(event.player, 'impure')
})

ServerEvents.basicCommand('factory0_nodes_depleted', event => {
  factory0GiveSolidNodeSamples(event.player, 'depleted')
})

ServerEvents.basicCommand('factory0_nodes_fluids', event => {
  for (const resource of FACTORY0_FLUID_TEST_RESOURCES) {
    event.player.give(`kubejs:factory0_${resource}_node`)
  }
  event.player.tell(Text.gray('Given six fluid-well marker samples. These do not contain fluids.'))
})

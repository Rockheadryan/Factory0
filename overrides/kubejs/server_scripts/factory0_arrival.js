// Factory0 arrival prototype for Minecraft 1.21.1 / NeoForge / KubeJS 2101.7.
//
// Automatic behavior:
// - The first time a player enters an FTB Team Bases shared/private base dimension,
//   place them in an Ad Astra lander 160 blocks above their current position.
// - A completion marker is stored per base dimension, so a newly created base
//   gets an arrival but /ftbteambases home does not replay it in the same base.
//
// Test commands:
//   /factory0_arrival_test
//   /factory0_arrival_reset
//   /factory0_arrival_cleanup

const FACTORY0_ARRIVAL = {
  completedKeyPrefix: 'factory0ArrivalComplete_',
  dropHeight: 160,
  descentSpeed: -0.18,
  activeTag: 'factory0_arrival_active',
  bannerTag: 'factory0_arrival_banner',
  landingMarkerTag: 'factory0_arrival_landing_marker',
  boosterStartedTag: 'factory0_arrival_booster_started',
  hudTag: 'factory0_arrival_hud',
  hudVariable: 'factory0_arrival_visible',
  hudActiveKey: 'factory0ArrivalHudActive',
  hudRetryKey: 'factory0ArrivalHudRetries',
  hudAgeKey: 'factory0ArrivalHudAgeSeconds',
  hudDurationSeconds: 6,
  privateDimensionPrefix: 'ftbteambases:private_for_',
  sharedDimension: 'ftbteambases:bases'
}


// Track loaded capsules directly. Idle ticks do not submit commands or scan
// entities. EntityJoinLevel (KubeJS's spawned event) also covers chunk reloads.
let factory0ArrivalEntities = Object.create(null)
let factory0ArrivalEntityCount = 0
let factory0ArrivalCleanup = Object.create(null)
let factory0ArrivalCleanupCount = 0
let factory0ArrivalClock = 0
let factory0ArrivalRecoverPending = true

function factory0QueueArrivalCleanup(dimension, delay) {
  const due = factory0ArrivalClock + delay
  if (factory0ArrivalCleanup[dimension] === undefined) {
    factory0ArrivalCleanupCount++
    factory0ArrivalCleanup[dimension] = due
  } else {
    factory0ArrivalCleanup[dimension] = Math.min(factory0ArrivalCleanup[dimension], due)
  }
}

function factory0TrackArrivalEntity(entity, level) {
  if (entity.isRemoved()) {
    return
  }
  const type = String(entity.type)
  const dimension = String(level.dimension)
  if (type === 'ad_astra:lander' && entity.getTags().contains(FACTORY0_ARRIVAL.activeTag)) {
    const id = String(entity.getUUID())
    if (factory0ArrivalEntities[id] === undefined) {
      factory0ArrivalEntityCount++
    }
    factory0ArrivalEntities[id] = { entity: entity, dimension: dimension }
  } else if (type === 'minecraft:marker' && entity.getTags().contains(FACTORY0_ARRIVAL.landingMarkerTag)) {
    // Give the matching capsule time to join the level before orphan cleanup.
    factory0QueueArrivalCleanup(dimension, 20)
  }
}

EntityEvents.spawned('ad_astra:lander', event => {
  factory0TrackArrivalEntity(event.entity, event.level)
})

EntityEvents.spawned('minecraft:marker', event => {
  factory0TrackArrivalEntity(event.entity, event.level)
})

ServerEvents.unloaded(event => {
  // Do not retain entity/level references across integrated-server sessions.
  factory0ArrivalEntities = Object.create(null)
  factory0ArrivalEntityCount = 0
  factory0ArrivalCleanup = Object.create(null)
  factory0ArrivalCleanupCount = 0
  factory0ArrivalClock = 0
  factory0ArrivalRecoverPending = true
})

function factory0HasPlayerArrival(player) {
  const ownerTag = `factory0_arrival_${player.name.string}`
  const dimension = factory0DimensionId(player)
  for (const id of Object.keys(factory0ArrivalEntities)) {
    const entry = factory0ArrivalEntities[id]
    if (entry.dimension === dimension && !entry.entity.isRemoved() &&
      entry.entity.getTags().contains(FACTORY0_ARRIVAL.activeTag) &&
      entry.entity.getTags().contains(ownerTag)) {
      return true
    }
  }
  return false
}

function factory0DimensionId(player) {
  // KubeJS exposes Level#dimension() as the ResourceLocation-like value itself.
  // Calling .location() here works against a ResourceKey in some mod APIs, but
  // fails in KubeJS 2101 because the exposed value is already minecraft:overworld.
  return String(player.level.dimension)
}

function factory0IsTeamBaseDimension(player) {
  const dimension = factory0DimensionId(player)
  return dimension === FACTORY0_ARRIVAL.sharedDimension ||
    dimension.startsWith(FACTORY0_ARRIVAL.privateDimensionPrefix)
}

function factory0CompletionKey(dimension) {
  // NBT allows broad string keys, but keeping the generated key to letters,
  // numbers, and underscores makes it easier to inspect with data commands.
  const safeDimension = dimension.replace(/[^a-zA-Z0-9_]/g, '_')
  return `${FACTORY0_ARRIVAL.completedKeyPrefix}${safeDimension}`
}

function factory0SetHud(player, visible) {
  const playerName = player.name.string
  // The layout itself remains enabled, but its two elements require this
  // client-side FancyMenu variable to be true. Unlike /fmlayout, changing the
  // variable does not persistently enable the whole HUD layout between worlds.
  player.server.runCommandSilent(
    `execute as ${playerName} run fmvariable set ` +
    `${FACTORY0_ARRIVAL.hudVariable} false ${visible ? 'true' : 'false'}`
  )
}

function factory0StartArrival(player, force) {
  const data = player.persistentData
  const dimension = factory0DimensionId(player)
  const completionKey = factory0CompletionKey(dimension)
  if (!force && data.getBoolean(completionKey)) {
    return false
  }

  const server = player.server
  const playerName = player.name.string
  // Minecraft usernames contain only letters, numbers, and underscores, so they
  // are safe to use as an entity tag. This avoids version-specific UUID methods.
  const uniqueTag = `factory0_arrival_${playerName}`
  const landingInstanceTag = `factory0_landing_${playerName}_${Number(player.tickCount)}`
  const x = Math.floor(Number(player.x)) + 0.5
  const z = Math.floor(Number(player.z)) + 0.5
  const landingY = Math.floor(Number(player.y))
  const arrivalY = landingY + FACTORY0_ARRIVAL.dropHeight

  // Remove an unfinished test capsule belonging to this player before retrying.
  server.runCommandSilent(
    `execute in ${dimension} run kill ` +
    `@e[type=ad_astra:lander,tag=${uniqueTag},tag=${FACTORY0_ARRIVAL.activeTag}]`
  )
  server.runCommandSilent(`execute in ${dimension} run kill @e[type=ad_astra:lander,tag=${uniqueTag}]`)
  server.runCommandSilent(`execute in ${dimension} run kill @e[type=minecraft:text_display,tag=${uniqueTag}]`)
  server.runCommandSilent(`execute in ${dimension} run kill @e[type=minecraft:item_display,tag=${uniqueTag}]`)
  server.runCommandSilent(`execute in ${dimension} run kill @e[type=minecraft:marker,tag=${uniqueTag}]`)

  const summoned = server.runCommandSilent(
    `execute in ${dimension} positioned ${x} ${arrivalY} ${z} run summon ad_astra:lander ~ ~ ~ ` +
    `{Tags:["factory0_arrival_capsule","${FACTORY0_ARRIVAL.activeTag}","${uniqueTag}"],` +
    `Speed:${FACTORY0_ARRIVAL.descentSpeed}f,FallDistance:0.0f}`
  )

  if (summoned < 1) {
    player.tell(Text.red('Factory0 arrival test could not summon ad_astra:lander.'))
    return false
  }

  server.runCommandSilent(`execute in ${dimension} run teleport ${playerName} ${x} ${arrivalY + 2.5} ${z}`)
  const mounted = server.runCommandSilent(
    `execute in ${dimension} positioned ${x} ${arrivalY} ${z} run ride ${playerName} mount ` +
    `@e[type=ad_astra:lander,tag=${uniqueTag},sort=nearest,limit=1,distance=..5]`
  )

  if (mounted < 1) {
    server.runCommandSilent(`execute in ${dimension} run kill @e[type=ad_astra:lander,tag=${uniqueTag}]`)
    server.runCommandSilent(`execute in ${dimension} run kill @e[type=minecraft:text_display,tag=${uniqueTag}]`)
    server.runCommandSilent(`execute in ${dimension} run teleport ${playerName} ${x} ${landingY} ${z}`)
    player.tell(Text.red('Factory0 arrival test created a lander but could not mount the player.'))
    return false
  }

  // SpiffyHUD renders the logo in screen space, so it remains perfectly stable
  // while the external camera orbits the descending capsule. FancyMenu's
  // command targets only this player, which also works for simultaneous bases.
  factory0SetHud(player, true)
  server.runCommandSilent(`tag ${playerName} add ${FACTORY0_ARRIVAL.hudTag}`)
  data.putInt(FACTORY0_ARRIVAL.hudRetryKey, 1)
  data.putInt(FACTORY0_ARRIVAL.hudAgeKey, 0)
  data.putBoolean(FACTORY0_ARRIVAL.hudActiveKey, true)
  server.runCommandSilent(`title ${playerName} clear`)
  // The invisible landing marker gives the cinematic a reliable target even
  // when Ad Astra does not set the vanilla OnGround flag at touchdown.
  server.runCommandSilent(
    `execute in ${dimension} positioned ${x} ${landingY} ${z} run summon minecraft:marker ~ ~ ~ ` +
    `{Tags:["${FACTORY0_ARRIVAL.landingMarkerTag}","${uniqueTag}","${landingInstanceTag}"]}`
  )
  data.putBoolean(completionKey, true)
  server.runCommandSilent(
    `title ${playerName} actionbar {"text":"AUTOMATIC DESCENT ACTIVE","color":"gold"}`
  )
  return true
}

PlayerEvents.tick(event => {
  const player = event.player
  // This does not need to be evaluated 20 times per second. It also prevents a
  // bad test build from flooding latest.log on every game tick.
  if (Number(player.tickCount) % 20 !== 0) {
    return
  }
  const playerName = player.name.string
  if (player.persistentData.getBoolean(FACTORY0_ARRIVAL.hudActiveKey)) {
    const hasActiveCapsule = factory0HasPlayerArrival(player)
    const hudAge = Number(player.persistentData.getInt(FACTORY0_ARRIVAL.hudAgeKey)) + 1
    player.persistentData.putInt(FACTORY0_ARRIVAL.hudAgeKey, hudAge)
    if (hasActiveCapsule && hudAge < FACTORY0_ARRIVAL.hudDurationSeconds) {
      // FTB Team Bases changes dimensions immediately before the cinematic.
      // Re-send the idempotent enable packet during the first few seconds so a
      // client that was still rebuilding its HUD cannot miss the one-shot event.
      const retries = Number(player.persistentData.getInt(FACTORY0_ARRIVAL.hudRetryKey))
      if (retries < 3) {
        factory0SetHud(player, true)
        player.persistentData.putInt(FACTORY0_ARRIVAL.hudRetryKey, retries + 1)
      }
    } else {
      // Hide after a short welcome period, or sooner if the capsule is gone.
      // This also cleans up after /reload or an unexpected dimension change.
      factory0SetHud(player, false)
      player.server.runCommandSilent(`tag ${playerName} remove ${FACTORY0_ARRIVAL.hudTag}`)
      player.persistentData.putBoolean(FACTORY0_ARRIVAL.hudActiveKey, false)
      player.persistentData.putInt(FACTORY0_ARRIVAL.hudRetryKey, 0)
      player.persistentData.putInt(FACTORY0_ARRIVAL.hudAgeKey, 0)
    }
  }
  const dimension = factory0DimensionId(player)
  if (player.persistentData.getBoolean(factory0CompletionKey(dimension))) {
    return
  }
  if (factory0IsTeamBaseDimension(player)) {
    factory0StartArrival(player, false)
  }
})

PlayerEvents.loggedIn(event => {
  // FancyMenu variables are client-instance scoped. Always begin a world with
  // the arrival card hidden, even if the client disconnected during a descent.
  factory0SetHud(event.player, false)
  event.player.server.runCommandSilent(
    `tag ${event.player.name.string} remove ${FACTORY0_ARRIVAL.hudTag}`
  )
  event.player.persistentData.putInt(FACTORY0_ARRIVAL.hudRetryKey, 0)
  event.player.persistentData.putInt(FACTORY0_ARRIVAL.hudAgeKey, 0)
  event.player.persistentData.putBoolean(FACTORY0_ARRIVAL.hudActiveKey, false)
})

function factory0TickArrivalDimension(server, dimension) {
  const selector = `@e[type=ad_astra:lander,tag=${FACTORY0_ARRIVAL.activeTag}]`
  const run = command => server.runCommandSilent(`execute in ${dimension} run ${command}`)
  // Ad Astra keeps the lander's vertical thrust in the Speed NBT field. Holding
  // it at a gentle negative value emulates continuous braking. Resetting only
  // this scripted capsule's fall distance prevents the normal crash explosion.
  run(
    `execute as ${selector} run data merge entity @s ` +
    `{Speed:${FACTORY0_ARRIVAL.descentSpeed}f,FallDistance:0.0f}`
  )

  // Start a low booster rumble once when the capsule reaches final approach.
  run(
    `execute as ${selector} at @s if entity ` +
    `@e[type=minecraft:marker,tag=${FACTORY0_ARRIVAL.landingMarkerTag},` +
    `tag=!${FACTORY0_ARRIVAL.boosterStartedTag},sort=nearest,limit=1,distance=..12] run ` +
    `playsound minecraft:item.firecharge.use master @a[distance=..96] ~ ~ ~ 1.2 0.65`
  )
  run(
    `execute as ${selector} at @s run tag ` +
    `@e[type=minecraft:marker,tag=${FACTORY0_ARRIVAL.landingMarkerTag},` +
    `tag=!${FACTORY0_ARRIVAL.boosterStartedTag},sort=nearest,limit=1,distance=..12] ` +
    `add ${FACTORY0_ARRIVAL.boosterStartedTag}`
  )

  // Cheap vanilla particles fake downward landing thrusters for the final
  // twelve blocks. Counts are intentionally modest because this runs per tick.
  run(
    `execute as ${selector} at @s if entity ` +
    `@e[type=minecraft:marker,tag=${FACTORY0_ARRIVAL.landingMarkerTag},distance=..12,limit=1] ` +
    `positioned ~ ~-1.2 ~ run particle minecraft:flame ~ ~ ~ 0.28 0.12 0.28 0.025 5 force ` +
    `@a[distance=..96]`
  )
  run(
    `execute as ${selector} at @s if entity ` +
    `@e[type=minecraft:marker,tag=${FACTORY0_ARRIVAL.landingMarkerTag},distance=..12,limit=1] ` +
    `positioned ~ ~-1.4 ~ run particle minecraft:cloud ~ ~ ~ 0.85 0.18 0.85 0.045 10 force ` +
    `@a[distance=..96]`
  )

  // Marker proximity is the primary touchdown signal. Play one solid landing
  // thump, then stop actively braking the capsule.
  run(
    `execute as ${selector} at @s if entity ` +
    `@e[type=minecraft:marker,tag=${FACTORY0_ARRIVAL.landingMarkerTag},distance=..2.5,limit=1] run ` +
    `playsound minecraft:block.heavy_core.place master @a[distance=..96] ~ ~ ~ 1.5 0.7`
  )
  run(
    `execute as ${selector} at @s if entity ` +
    `@e[type=minecraft:marker,tag=${FACTORY0_ARRIVAL.landingMarkerTag},distance=..2.5,limit=1] run ` +
    `tag @s remove ${FACTORY0_ARRIVAL.activeTag}`
  )
  // Stop managing a capsule after touchdown. It retains the general capsule
  // tag so the cleanup command can still find it later.
  run(
    `execute as ${selector} if data entity @s {OnGround:1b} run tag @s remove ${FACTORY0_ARRIVAL.activeTag}`
  )

}

ServerEvents.tick(event => {
  factory0ArrivalClock++
  if (factory0ArrivalRecoverPending) {
    // Once after script load/reload, recover already-loaded tagged entities.
    // Later chunk loads are handled by the targeted spawned listeners above.
    factory0ArrivalRecoverPending = false
    for (const level of event.server.getAllLevels()) {
      for (const entity of level.getAllEntities()) {
        factory0TrackArrivalEntity(entity, level)
      }
    }
  }

  if (factory0ArrivalEntityCount === 0 && factory0ArrivalCleanupCount === 0) {
    return
  }

  const dimensions = Object.create(null)
  if (factory0ArrivalEntityCount > 0) {
    for (const id of Object.keys(factory0ArrivalEntities)) {
      const entry = factory0ArrivalEntities[id]
      if (entry.entity.isRemoved() || !entry.entity.getTags().contains(FACTORY0_ARRIVAL.activeTag)) {
        delete factory0ArrivalEntities[id]
        factory0ArrivalEntityCount--
        factory0QueueArrivalCleanup(entry.dimension, 0)
      } else {
        dimensions[entry.dimension] = true
      }
    }
    for (const dimension of Object.keys(dimensions)) {
      factory0TickArrivalDimension(event.server, dimension)
    }
  }

  if (factory0ArrivalCleanupCount > 0) {
    for (const dimension of Object.keys(factory0ArrivalCleanup)) {
      if (factory0ArrivalCleanup[dimension] <= factory0ArrivalClock) {
        delete factory0ArrivalCleanup[dimension]
        factory0ArrivalCleanupCount--
        // One-shot cleanup after marker load, landing, removal or chunk unload.
        // This is not a permanent poll of landed capsules or every dimension.
        event.server.runCommandSilent(
          `execute in ${dimension} as @e[type=minecraft:marker,tag=${FACTORY0_ARRIVAL.landingMarkerTag}] at @s ` +
          `unless entity @e[type=ad_astra:lander,tag=${FACTORY0_ARRIVAL.activeTag},distance=..192] run kill @s`
        )
      }
    }
  }
})

ServerEvents.basicCommand('factory0_arrival_test', event => {
  if (factory0StartArrival(event.player, true)) {
    event.player.tell(Text.green('Factory0 arrival test started.'))
  }
})

ServerEvents.basicCommand('factory0_arrival_reset', event => {
  const player = event.player
  const dimension = factory0DimensionId(player)
  player.persistentData.putBoolean(factory0CompletionKey(dimension), false)
  player.tell(Text.yellow('Factory0 arrival marker reset for this base dimension.'))
})

ServerEvents.basicCommand('factory0_arrival_cleanup', event => {
  const player = event.player
  const dimension = factory0DimensionId(player)
  const playerName = player.name.string
  factory0SetHud(player, false)
  player.server.runCommandSilent(`tag ${playerName} remove ${FACTORY0_ARRIVAL.hudTag}`)
  player.persistentData.putInt(FACTORY0_ARRIVAL.hudRetryKey, 0)
  player.persistentData.putInt(FACTORY0_ARRIVAL.hudAgeKey, 0)
  player.persistentData.putBoolean(FACTORY0_ARRIVAL.hudActiveKey, false)
  player.server.runCommandSilent(`title ${playerName} clear`)
  // If a test capsule ran away vertically, return its rider to the invisible
  // landing target before removing anything. This makes cleanup a safe rescue.
  player.server.runCommandSilent(
    `execute in ${dimension} at ${playerName} if entity ` +
    `@e[type=minecraft:marker,tag=${FACTORY0_ARRIVAL.landingMarkerTag},sort=nearest,limit=1] run ` +
    `teleport ${playerName} @e[type=minecraft:marker,tag=${FACTORY0_ARRIVAL.landingMarkerTag},sort=nearest,limit=1]`
  )
  player.server.runCommandSilent(
    `execute in ${dimension} at ${playerName} run kill ` +
    `@e[type=ad_astra:lander,tag=factory0_arrival_capsule,tag=${FACTORY0_ARRIVAL.activeTag},distance=..64]`
  )
  player.server.runCommandSilent(
    `execute in ${dimension} at ${playerName} run kill ` +
    `@e[type=ad_astra:lander,tag=factory0_arrival_capsule,distance=..64]`
  )
  player.server.runCommandSilent(
    `execute in ${dimension} at ${playerName} run kill ` +
    `@e[tag=${FACTORY0_ARRIVAL.bannerTag},distance=..64]`
  )
  player.server.runCommandSilent(
    `execute in ${dimension} at ${playerName} run kill ` +
    `@e[type=minecraft:marker,tag=${FACTORY0_ARRIVAL.landingMarkerTag},distance=..64]`
  )
  player.tell(Text.gray('Removed Factory0 arrival capsules within 64 blocks.'))
})

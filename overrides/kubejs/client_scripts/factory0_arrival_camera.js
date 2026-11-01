// Factory0 arrival cinematic.
//
// While the local player is riding an Ad Astra lander, switch to rear
// third-person and make one slow orbit. Restore their previous perspective
// when they dismount. This is deliberately client-only: a camera problem must
// never prevent the server-side landing sequence.

const $Minecraft = Java.loadClass('net.minecraft.client.Minecraft')
const $CameraType = Java.loadClass('net.minecraft.client.CameraType')

// External View is optional. Factory0 currently ships it, but keeping this
// lookup guarded means removing or updating that mod cannot break arrivals.
let factory0ExternalViewHandler = null
let factory0ExternalDistanceField = null
try {
  factory0ExternalViewHandler = Java.loadClass(
    'com.deepseasaltyfish.externalview.event.client.CameraAdjustHandler'
  )
  factory0ExternalDistanceField = factory0ExternalViewHandler.class.getDeclaredField('additionalDistance')
  factory0ExternalDistanceField.setAccessible(true)
} catch (ignored) {
  factory0ExternalViewHandler = null
  factory0ExternalDistanceField = null
}

const FACTORY0_CAMERA = {
  orbitDegreesPerTick: 1,
  fullOrbit: 360,
  // External View adds this to vanilla's roughly four-block camera boom.
  externalViewExtension: 8,
  externalViewFov: 78,
  fallbackFov: 92
}

let factory0CameraActive = false
let factory0PreviousCameraType = null
let factory0PreviousFov = null
let factory0PreviousExternalDistance = null
let factory0UsingExternalView = false
let factory0FovOption = null
let factory0OrbitYaw = 0
let factory0OrbitProgress = 0
let factory0CameraFailed = false

function factory0GetExternalDistance() {
  if (factory0ExternalDistanceField === null) {
    return null
  }
  try {
    return Number(factory0ExternalDistanceField.getDouble(null))
  } catch (error) {
    console.error(`Factory0 could not read External View camera distance: ${error}`)
    factory0ExternalDistanceField = null
    return null
  }
}

function factory0SetExternalDistance(distance) {
  if (factory0ExternalDistanceField === null) {
    return false
  }
  try {
    factory0ExternalDistanceField.setDouble(null, Number(distance))
    return true
  } catch (error) {
    console.error(`Factory0 could not set External View camera distance: ${error}`)
    factory0ExternalDistanceField = null
    return false
  }
}

function factory0GetFovOption(minecraft) {
  // Mojang mappings expose this as Options#fov(). KubeJS versions which map
  // bean-style access instead expose the same OptionInstance as .fov.
  try {
    return minecraft.options.fov()
  } catch (ignored) {
    try {
      return minecraft.options.fov
    } catch (alsoIgnored) {
      return null
    }
  }
}

function factory0RestoreCamera(minecraft) {
  if (!factory0CameraActive) {
    return
  }

  if (factory0PreviousCameraType !== null) {
    minecraft.options.setCameraType(factory0PreviousCameraType)
  }
  if (factory0PreviousFov !== null) {
    try {
      factory0FovOption = factory0GetFovOption(minecraft)
      if (factory0FovOption !== null) {
        factory0FovOption.set(factory0PreviousFov)
      }
    } catch (error) {
      console.error(`Factory0 arrival could not restore FOV: ${error}`)
    }
  }
  if (factory0PreviousExternalDistance !== null) {
    factory0SetExternalDistance(factory0PreviousExternalDistance)
  }

  factory0CameraActive = false
  factory0PreviousCameraType = null
  factory0PreviousFov = null
  factory0PreviousExternalDistance = null
  factory0UsingExternalView = false
  factory0FovOption = null
  factory0OrbitProgress = 0
}

ClientEvents.tick(event => {
  const minecraft = $Minecraft.getInstance()
  const player = minecraft.player

  if (player === null) {
    factory0RestoreCamera(minecraft)
    return
  }

  const vehicle = player.vehicle
  const ridingLander = vehicle !== null && String(vehicle.type) === 'ad_astra:lander'

  if (!ridingLander) {
    factory0RestoreCamera(minecraft)
    return
  }

  if (!factory0CameraActive) {
    factory0PreviousCameraType = minecraft.options.cameraType
    minecraft.options.setCameraType($CameraType.THIRD_PERSON_BACK)
    factory0PreviousExternalDistance = factory0GetExternalDistance()
    factory0UsingExternalView = factory0PreviousExternalDistance !== null &&
      factory0SetExternalDistance(FACTORY0_CAMERA.externalViewExtension)
    try {
      factory0FovOption = factory0GetFovOption(minecraft)
      if (factory0FovOption !== null) {
        factory0PreviousFov = Number(factory0FovOption.get())
        factory0FovOption.set(factory0UsingExternalView ? FACTORY0_CAMERA.externalViewFov : FACTORY0_CAMERA.fallbackFov)
      }
    } catch (error) {
      factory0PreviousFov = null
      console.error(`Factory0 arrival wide camera disabled: ${error}`)
    }
    factory0OrbitYaw = Number(player.getYaw())
    factory0OrbitProgress = 0
    factory0CameraFailed = false
    factory0CameraActive = true
  }

  // External View calculates its offset during each rendered frame. Reassert
  // our cinematic distance while mounted in case another camera handler or a
  // perspective transition resets the mod's static distance to zero.
  if (factory0UsingExternalView) {
    factory0SetExternalDistance(FACTORY0_CAMERA.externalViewExtension)
  }

  // Complete one orbit, then leave the camera behind the player for landing.
  if (!factory0CameraFailed && factory0OrbitProgress < FACTORY0_CAMERA.fullOrbit) {
    factory0OrbitYaw += FACTORY0_CAMERA.orbitDegreesPerTick
    factory0OrbitProgress += FACTORY0_CAMERA.orbitDegreesPerTick
    try {
      // KubeJS remaps Minecraft's setYRot/setYBodyRot methods to these names.
      player.setYaw(factory0OrbitYaw)
      player.setBodyYaw(factory0OrbitYaw)
    } catch (error) {
      factory0CameraFailed = true
      console.error(`Factory0 arrival camera orbit disabled: ${error}`)
    }
  }
})

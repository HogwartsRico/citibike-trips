const glslify = require('glslify')
const mat4 = require('gl-mat4')
const intersect = require('ray-plane-intersection')
const pickRay = require('camera-picking-ray')

module.exports = function createStateTransitioner (regl, trips, settings) {
  let mousePosition = [0, 0]
  regl._gl.canvas.addEventListener('mousemove', (e) => {
    mousePosition = [e.clientX, e.clientY]
  })
  let isShiftPressed = false
  document.addEventListener('keydown', (e) => {
    if (e.which === 16) isShiftPressed = true
  })
  document.addEventListener('keyup', (e) => {
    if (e.which === 16) isShiftPressed = false
  })

  const tripStateTextureSize = Math.ceil(Math.sqrt(trips.length))
  const tripStateTextureLength = tripStateTextureSize * tripStateTextureSize
  const initialTripState = new Float32Array(tripStateTextureLength * 4)
  for (let i = 0; i < tripStateTextureLength; ++i) {
    initialTripState[i * 4] = 0 // arcHeight
    initialTripState[i * 4 + 1] = 0 // pathAlpha
    initialTripState[i * 4 + 2] = 0 // pointSize
  }

  let prevTripStateTexture = createStateBuffer(initialTripState, tripStateTextureSize)
  let curTripStateTexture = createStateBuffer(initialTripState, tripStateTextureSize)
  let nextTripStateTexture = createStateBuffer(initialTripState, tripStateTextureSize)

  const stateIndexes = []
  const tripMetaDataState = new Float32Array(tripStateTextureLength * 4)
  for (let j = 0; j < trips.length; j++) {
    const tripStateIndexX = j % tripStateTextureSize
    const tripStateIndexY = j / tripStateTextureSize | 0
    stateIndexes.push([tripStateIndexX / tripStateTextureSize, tripStateIndexY / tripStateTextureSize])
    tripMetaDataState[j * 4] = trips[j].subscriber ? 1.0 : 0.0 // subscriber
    tripMetaDataState[j * 4 + 1] = trips[j].startPosition[0]
    tripMetaDataState[j * 4 + 2] = trips[j].startPosition[1]
  }
  const tripMetaDataTexture = createStateBuffer(tripMetaDataState, tripStateTextureSize)

  const dampening = 1.0
  const stiffness = 0.1
  const MAX_ARC_HEIGHT = 2.5
  const MAX_PT_SIZE = 3

  const updateState = regl({
    framebuffer: () => nextTripStateTexture,

    vert: glslify.file('./trip-state.vert'),
    frag: glslify.file('./trip-state.frag'),

    attributes: {
      position: [
        -1, -1,
        1, -1,
        -1, 1,
        1, 1
      ]
    },

    uniforms: {
      curTripStateTexture: () => curTripStateTexture,
      prevTripStateTexture: () => prevTripStateTexture,
      tripMetaDataTexture: tripMetaDataTexture,
      rayPicker: regl.prop('rayPicker'),
      rayPickerThreshold: regl.prop('rayPickerThreshold'),
      dampening: dampening,
      stiffness: stiffness,
      maxArcHeight: MAX_ARC_HEIGHT,
      maxPointSize: MAX_PT_SIZE,
      showSubscriber: regl.prop('showSubscriber'),
      showNonSubscriber: regl.prop('showNonSubscriber'),
      curvedPaths: regl.prop('curvedPaths'),
      showPaths: regl.prop('showPaths'),
      showPoints: regl.prop('showPoints')
    },

    count: 4,
    primitive: 'triangle strip'
  })

  function getStateIndexes () {
    return stateIndexes
  }

  function tick (context) {
    cycleStates()
    updateState({
      showSubscriber: context.subscriber,
      showNonSubscriber: context.nonSubscriber,
      curvedPaths: context.curvedPaths,
      showPaths: context.showPaths,
      showPoints: context.showPoints,
      rayPickerThreshold: isShiftPressed ? context.rayPickerThreshold : 10,
      rayPicker: isShiftPressed ? getIntersection(
        mousePosition,
        context.viewport,
        context.projection,
        context.view
      ) || [0, 0, 0] : [0, 0, 0]
    })
  }

  function getStateTexture () {
    return curTripStateTexture
  }

  return {
    tick,
    getStateTexture,
    getStateIndexes
  }

  function createStateBuffer (initialState, textureSize) {
    const initialTexture = regl.texture({
      data: initialState,
      shape: [textureSize, textureSize, 4],
      type: 'float'
    })

    let fbuffer
    try {
      fbuffer = regl.framebuffer({
        color: initialTexture,
        depth: false,
        stencil: false
      })
    } catch (err) {
      // notSupported()
      throw new Error(err)
    }

    return fbuffer
  }

  function cycleStates () {
    const tmp = prevTripStateTexture
    prevTripStateTexture = curTripStateTexture
    curTripStateTexture = nextTripStateTexture
    nextTripStateTexture = tmp
  }
}

function getIntersection (mouse, viewport, projection, view) {
  const projView = mat4.multiply([], projection, view)
  const invProjView = mat4.invert([], projView)
  const rayOrigin = []
  const rayDir = []
  pickRay(rayOrigin, rayDir, mouse, viewport, invProjView)
  const normal = [0, 0, -1]
  const distance = 0
  return intersect([], rayOrigin, rayDir, normal, distance)
}
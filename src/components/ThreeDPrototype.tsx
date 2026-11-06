import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { TILE_REGIONS, TILES, type TileData } from '../data/tiles';
import './ThreeDPrototype.css';

interface GridCell {
  x: number;
  y: number;
  data: TileData;
  rotation: number;
}

interface MeepleMark {
  cellX: number;
  cellY: number;
  regionId: string;
  color: string;
}

interface SceneRuntime {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  boardRoot: THREE.Group;
  markers: THREE.Object3D[];
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  target: THREE.Vector3;
}

const TILE_STEP = 2;
const MEEPLE_COLOR = '#3285e8';
const PROTOTYPE_TILES = ['tiles_4', 'tiles_1', 'tiles_12', 'tiles_25', 'tiles_19'];
const getTile = (label: string) => TILES.find(tile => tile.label === label)!;

const initialCells: GridCell[] = [
  { x: 0, y: 0, data: getTile('tiles_4'), rotation: 0 },
  { x: -1, y: 0, data: getTile('tiles_19'), rotation: 0 },
  { x: 1, y: 0, data: getTile('tiles_12'), rotation: 90 },
  { x: 0, y: -1, data: getTile('tiles_25'), rotation: 0 },
  { x: 0, y: 1, data: getTile('tiles_1'), rotation: 0 },
];

function disposeGroup(group: THREE.Group) {
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => material.dispose());
  });
  group.clear();
}

function addBox(
  parent: THREE.Group,
  width: number,
  depth: number,
  x: number,
  z: number,
  color: string,
  y = 0.12,
  height = 0.025,
  opacity = 1,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.88, transparent: opacity < 1, opacity }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addMeeple(parent: THREE.Group, x: number, z: number, color: string, ghost = false) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.48,
    transparent: ghost,
    opacity: ghost ? 0.48 : 1,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.15, 0.28, 8), material);
  body.position.set(x, 0.33, z);
  body.castShadow = true;
  parent.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), material);
  head.position.set(x, 0.53, z);
  head.castShadow = true;
  parent.add(head);
}

function addLighthouse(parent: THREE.Group, ghost = false) {
  const alpha = ghost ? 0.48 : 1;
  const white = new THREE.MeshStandardMaterial({ color: '#f5ead1', roughness: 0.75, transparent: ghost, opacity: alpha });
  const red = new THREE.MeshStandardMaterial({ color: '#df5745', roughness: 0.72, transparent: ghost, opacity: alpha });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.12, 10), red);
  base.position.y = 0.2;
  parent.add(base);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.55, 10), white);
  tower.position.y = 0.52;
  tower.castShadow = true;
  parent.add(tower);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.18, 10), red);
  roof.position.y = 0.89;
  roof.castShadow = true;
  parent.add(roof);
  const lamp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.115, 0.12, 0.11, 10),
    new THREE.MeshStandardMaterial({ color: '#f6c959', emissive: '#634410', roughness: 0.3, transparent: ghost, opacity: alpha }),
  );
  lamp.position.y = 0.79;
  parent.add(lamp);
}

function addTileSurface(group: THREE.Group, label: string, ghost: boolean) {
  const alpha = ghost ? 0.48 : 1;
const grass = '#6eaa62';
  const sea = '#4faec2';
  const beach = '#e9c987';
  const road = '#927354';

  addBox(group, 1.96, 1.96, 0, 0, '#70a85c', 0.116, 0.025, alpha);

  if (label === 'tiles_4') {
    addBox(group, 1.94, 0.47, 0, -0.745, beach, 0.137, 0.025, alpha);
    addBox(group, 1.94, 0.53, 0, 0.72, sea, 0.137, 0.025, alpha);
    addBox(group, 1.94, 0.24, 0, 0, road, 0.16, 0.035, alpha);
  } else if (label === 'tiles_1') {
    addBox(group, 1.94, 1.94, 0, 0, sea, 0.137, 0.025, alpha);
    const island = new THREE.Mesh(
      new THREE.CylinderGeometry(0.61, 0.7, 0.12, 16),
      new THREE.MeshStandardMaterial({ color: beach, roughness: 0.95, transparent: ghost, opacity: alpha }),
    );
    island.position.y = 0.22;
    island.castShadow = true;
    group.add(island);
    if (!ghost) addLighthouse(group);
    else addLighthouse(group, true);
    addBox(group, 0.75, 0.22, 0, 0.82, road, 0.15, 0.025, alpha);
  } else if (label === 'tiles_12') {
    addBox(group, 0.24, 1.94, 0, 0, road, 0.15, 0.035, alpha);
    addBox(group, 1.94, 0.24, 0, 0, road, 0.15, 0.035, alpha);
    addBox(group, 1.94, 0.34, 0, -0.79, beach, 0.137, 0.025, alpha);
  } else if (label === 'tiles_25') {
    addBox(group, 0.53, 1.94, -0.72, 0, sea, 0.137, 0.025, alpha);
    addBox(group, 0.53, 1.94, 0.72, 0, sea, 0.137, 0.025, alpha);
    addBox(group, 0.82, 1.94, 0, 0, beach, 0.14, 0.03, alpha);
  } else if (label === 'tiles_19') {
    addBox(group, 0.56, 1.94, -0.71, 0, sea, 0.137, 0.025, alpha);
    addBox(group, 1.94, 0.52, 0, -0.72, sea, 0.137, 0.025, alpha);
    addBox(group, 0.24, 1.02, 0.72, 0.46, road, 0.16, 0.035, alpha);
    addBox(group, 0.94, 0.24, 0.48, 0.86, road, 0.16, 0.035, alpha);
  } else {
    // Unmodeled tiles stay visible with a neutral top while the fixture focuses on five archetypes.
    const edgeColors = { Sea: sea, Beach: beach, Road: road };
    const edges = label === 'tiles_4' ? [] : getTile(label).edges;
    edges.forEach((edge, index) => {
      const color = edgeColors[edge];
      if (index === 0) addBox(group, 1.94, 0.32, 0, -0.82, color, 0.14, 0.025, alpha);
      if (index === 1) addBox(group, 0.32, 1.94, 0.82, 0, color, 0.14, 0.025, alpha);
      if (index === 2) addBox(group, 1.94, 0.32, 0, 0.82, color, 0.14, 0.025, alpha);
      if (index === 3) addBox(group, 0.32, 1.94, -0.82, 0, color, 0.14, 0.025, alpha);
    });
  }

  if (label === 'tiles_25' && !ghost) {
    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(0.23, 0.18, 0.18),
      new THREE.MeshStandardMaterial({ color: '#c68a38', roughness: 0.65 }),
    );
    chest.position.set(0, 0.25, 0.42);
    chest.castShadow = true;
    group.add(chest);
  }

  if (label === 'tiles_19' && !ghost) {
    for (const [x, z] of [[-0.3, 0.28], [-0.48, 0.4], [0.32, -0.22]] as const) {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.04, 0.18, 5),
        new THREE.MeshStandardMaterial({ color: '#816044', roughness: 1 }),
      );
      trunk.position.set(x, 0.25, z);
      group.add(trunk);
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(0.13, 0.24, 6),
        new THREE.MeshStandardMaterial({ color: grass, roughness: 1 }),
      );
      crown.position.set(x, 0.43, z);
      crown.castShadow = true;
      group.add(crown);
    }
  }
}

function createTile(cell: GridCell, ghost = false) {
  const group = new THREE.Group();
  group.position.set(cell.x * TILE_STEP, 0, cell.y * TILE_STEP);
  group.rotation.y = -THREE.MathUtils.degToRad(cell.rotation);
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.2, 2),
    new THREE.MeshStandardMaterial({ color: '#9e704c', roughness: 0.9, transparent: ghost, opacity: ghost ? 0.48 : 1 }),
  );
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);
  addTileSurface(group, cell.data.label, ghost);
  return group;
}

function addMeepleToCell(group: THREE.Group, mark: MeepleMark) {
  const regions = TILE_REGIONS[PROTOTYPE_TILES.find(label => label === group.userData.label) ?? ''] ?? [];
  const region = regions.find(candidate => candidate.id === mark.regionId);
  const px = region?.pos[0] ?? 50;
  const py = region?.pos[1] ?? 50;
  const x = ((px / 100) - 0.5) * 1.45;
  const z = ((py / 100) - 0.5) * 1.45;
  addMeeple(group, x, z, mark.color);
}

function rotateTileLocalPosition(x: number, z: number, rotation: number) {
  const radians = -THREE.MathUtils.degToRad(rotation);
  return {
    x: x * Math.cos(radians) + z * Math.sin(radians),
    z: -x * Math.sin(radians) + z * Math.cos(radians),
  };
}

function makeMarker(x: number, z: number, kind: 'slot' | 'region', data: Record<string, string | number>) {
  const slot = kind === 'slot';
  const mesh = new THREE.Mesh(
    slot ? new THREE.CylinderGeometry(0.34, 0.34, 0.035, 24) : new THREE.SphereGeometry(0.17, 14, 10),
    new THREE.MeshStandardMaterial({
      color: slot ? '#f6c95b' : '#ffffff',
      emissive: slot ? '#6f4d12' : '#587c80',
      transparent: true,
      opacity: slot ? 0.78 : 0.9,
      roughness: 0.45,
    }),
  );
  mesh.position.set(x, slot ? 0.19 : 0.28, z);
  mesh.userData = { action: kind, ...data };
  mesh.castShadow = true;
  return mesh;
}

function getAvailableSlots(cells: GridCell[]) {
  const occupied = new Set(cells.map(cell => `${cell.x},${cell.y}`));
  const slots = new Map<string, { x: number; y: number }>();
  cells.forEach(cell => {
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = cell.x + dx;
      const y = cell.y + dy;
      const key = `${x},${y}`;
      if (!occupied.has(key)) slots.set(key, { x, y });
    }
  });
  return [...slots.values()];
}

export default function ThreeDPrototype() {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);
  const handlersRef = useRef<{
    onSlot: (x: number, y: number) => void;
    onRegion: (x: number, y: number, regionId: string) => void;
  }>({ onSlot: () => {}, onRegion: () => {} });
  const [cells, setCells] = useState(initialCells);
  const [meeples, setMeeples] = useState<MeepleMark[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<{ x: number; y: number } | null>(null);
  const [selectedTileIndex, setSelectedTileIndex] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [meepleMode, setMeepleMode] = useState(false);
  const [notice, setNotice] = useState('Click a gold slot to preview tile selection and placement.');
  const selectedTile = useMemo(() => getTile(PROTOTYPE_TILES[selectedTileIndex]), [selectedTileIndex]);
  const availableSlots = useMemo(() => getAvailableSlots(cells), [cells]);

  useEffect(() => {
    handlersRef.current.onSlot = (x, y) => {
      setSelectedSlot({ x, y });
      setRotation(0);
      setNotice(`Selected slot (${x}, ${y}). Rotate the preview, then confirm placement.`);
    };
    handlersRef.current.onRegion = (x, y, regionId) => {
      if (!meepleMode) return;
      if (meeples.some(meeple => meeple.cellX === x && meeple.cellY === y)) {
        setNotice('This example slot is already occupied.');
        return;
      }
      setMeeples(previous => [...previous, { cellX: x, cellY: y, regionId, color: MEEPLE_COLOR }]);
      setMeepleMode(false);
      setNotice('Explorer placed. It follows tile rotation and camera movement.');
    };
  }, [meeples, meepleMode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#d8c4a1');
    const camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 100);
    camera.position.set(9, 12, 10);
    const target = new THREE.Vector3(0, 0, 0);
    camera.lookAt(target);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight('#fff6e5', '#6d806c', 2.1));
    const sun = new THREE.DirectionalLight('#fff0d1', 3.1);
    sun.position.set(-6, 11, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: '#d8c4a1', roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.12;
    floor.receiveShadow = true;
    scene.add(floor);

    const boardRoot = new THREE.Group();
    scene.add(boardRoot);
    const runtime: SceneRuntime = {
      scene,
      camera,
      renderer,
      boardRoot,
      markers: [],
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      target,
    };
    runtimeRef.current = runtime;

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      const viewSize = 6.8;
      const aspect = width / height;
      camera.left = -viewSize * aspect;
      camera.right = viewSize * aspect;
      camera.top = viewSize;
      camera.bottom = -viewSize;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      renderer.render(scene, camera);
    };
    const render = () => renderer.render(scene, camera);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    let down = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    const pointerDown = (event: PointerEvent) => {
      down = true;
      moved = false;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!down) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (moved) {
        const scale = 0.012 * (6.8 / camera.zoom);
        camera.translateX(-dx * scale);
        camera.translateY(dy * scale);
        target.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(10));
        render();
      }
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const pointerUp = (event: PointerEvent) => {
      if (!down) return;
      down = false;
      if (moved) return;
      const rect = renderer.domElement.getBoundingClientRect();
      runtime.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      runtime.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      runtime.raycaster.setFromCamera(runtime.pointer, camera);
      const hit = runtime.raycaster.intersectObjects(runtime.markers, true)[0]?.object;
      const action = hit?.userData as { action?: string; x?: number; y?: number; regionId?: string } | undefined;
      if (action?.action === 'slot' && action.x !== undefined && action.y !== undefined) {
        handlersRef.current.onSlot(action.x, action.y);
      } else if (action?.action === 'region' && action.x !== undefined && action.y !== undefined && action.regionId) {
        handlersRef.current.onRegion(action.x, action.y, action.regionId);
      }
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      camera.zoom = THREE.MathUtils.clamp(camera.zoom - event.deltaY * 0.001, 0.55, 2.2);
      camera.updateProjectionMatrix();
      render();
    };

    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointermove', pointerMove);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.domElement.addEventListener('pointercancel', pointerUp);
    renderer.domElement.addEventListener('wheel', wheel, { passive: false });

    return () => {
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('pointercancel', pointerUp);
      renderer.domElement.removeEventListener('wheel', wheel);
      disposeGroup(boardRoot);
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    disposeGroup(runtime.boardRoot);
    runtime.markers = [];

    cells.forEach(cell => {
      const group = createTile(cell);
      group.userData.label = cell.data.label;
      meeples.filter(mark => mark.cellX === cell.x && mark.cellY === cell.y)
        .forEach(mark => addMeepleToCell(group, mark));
      runtime.boardRoot.add(group);
    });

    if (selectedSlot) {
      const preview = createTile({ ...selectedSlot, data: selectedTile, rotation }, true);
      runtime.boardRoot.add(preview);
    }

    if (!meepleMode) {
      availableSlots.forEach(slot => {
        const marker = makeMarker(slot.x * TILE_STEP, slot.y * TILE_STEP, 'slot', slot);
        runtime.boardRoot.add(marker);
        runtime.markers.push(marker);
      });
    } else {
      cells.forEach(cell => {
        if (meeples.some(mark => mark.cellX === cell.x && mark.cellY === cell.y)) return;
        (TILE_REGIONS[cell.data.label] ?? []).forEach(region => {
          const x = ((region.pos[0] / 100) - 0.5) * 1.45;
          const z = ((region.pos[1] / 100) - 0.5) * 1.45;
          const rotated = rotateTileLocalPosition(x, z, cell.rotation);
          const marker = makeMarker(
            cell.x * TILE_STEP + rotated.x,
            cell.y * TILE_STEP + rotated.z,
            'region',
            { x: cell.x, y: cell.y, regionId: region.id },
          );
          runtime.boardRoot.add(marker);
          runtime.markers.push(marker);
        });
      });
    }
    runtime.renderer.render(runtime.scene, runtime.camera);
  }, [cells, meeples, availableSlots, selectedSlot, selectedTile, rotation, meepleMode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'r' && selectedSlot) {
        setRotation(value => (value + 90) % 360);
      }
      if (event.key === 'Escape') {
        setSelectedSlot(null);
        setMeepleMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSlot]);

  const rotatePreview = () => {
    setRotation(previous => (previous + 90) % 360);
    setNotice(`Preview orientation: ${(rotation + 90) % 360}°`);
  };

  const confirmPlacement = () => {
    if (!selectedSlot) return;
    const collision = cells.some(cell => cell.x === selectedSlot.x && cell.y === selectedSlot.y);
    if (collision) return;
    setCells(previous => [...previous, { ...selectedSlot, data: selectedTile, rotation }]);
    setSelectedSlot(null);
    setMeepleMode(true);
    setNotice('Tile placed. You can now place a sample explorer on a visible region.');
  };

  const resetPrototype = () => {
    setCells(initialCells);
    setMeeples([]);
    setSelectedSlot(null);
    setRotation(0);
    setMeepleMode(false);
    setNotice('Board reset. Click a gold slot to begin.');
  };

  return (
    <main className="three-proof-page">
      <div className="three-proof-canvas" ref={hostRef} />
      <header className="three-proof-header">
        <div>
          <span className="three-proof-eyebrow">CARCAGEM · VISUAL PROTOTYPE</span>
          <h1>CarcaGem 3D Board Prototype</h1>
        </div>
        <a href={window.location.pathname} className="three-proof-exit">Back to Game</a>
      </header>
      <aside className="three-proof-panel">
        <div className="three-proof-badge">Visual and Interaction Prototype</div>
        <p className="three-proof-notice">{notice}</p>
        <label className="three-proof-label" htmlFor="proof-tile">Sample Tile</label>
        <select
          id="proof-tile"
          value={selectedTile.label}
          onChange={event => setSelectedTileIndex(PROTOTYPE_TILES.indexOf(event.target.value))}
        >
          {PROTOTYPE_TILES.map(label => (
            <option key={label} value={label}>{label.replace('tiles_', 'Tile ')}</option>
          ))}
        </select>
        <div className="three-proof-actions">
          <button onClick={rotatePreview}>Rotate 90° <span>R</span></button>
          <button onClick={() => setMeepleMode(value => !value)} className={meepleMode ? 'active' : ''}>
            {meepleMode ? 'Select a region' : 'Place Explorer'}
          </button>
          <button onClick={confirmPlacement} disabled={!selectedSlot}>Confirm Placement</button>
          <button className="quiet" onClick={resetPrototype}>Reset Prototype</button>
        </div>
        <div className="three-proof-scores">
          <span><i style={{ background: MEEPLE_COLOR }} />Blue Sample Player</span>
          <b>{meeples.length} explorers</b>
        </div>
        <p className="three-proof-footnote">Gold discs mark open slots. Drag to pan and scroll to zoom. This prototype tests visuals and selection only; it does not run game rules.</p>
      </aside>
      <div className="three-proof-view-label">Orthographic Isometric View · Fixed Orientation</div>
    </main>
  );
}

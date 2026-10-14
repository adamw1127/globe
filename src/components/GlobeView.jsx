import { useEffect, useRef } from 'react';
import Globe from 'globe.gl';
import { MeshPhongMaterial, Color } from 'three';

const LAND_ALT = 0.003;
const BASE_ALT = 0.008;
const SELECT_ALT = 0.03;

// Thin React wrapper around globe.gl. Polygons come from the current border
// snapshot; `colorOf(feature)` provides the choropleth color.
export default function GlobeView({ features, land, colorOf, selectedKey, onSelect, featureKey, labelOf, flyTo }) {
  const elRef = useRef(null);
  const globeRef = useRef(null);
  const hoverRef = useRef(null);
  const props = useRef({});
  props.current = { colorOf, selectedKey, onSelect, featureKey, labelOf };

  useEffect(() => {
    const el = elRef.current;
    const globe = new Globe(el, { animateIn: true })
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true)
      .atmosphereColor('#4aa3ff')
      .atmosphereAltitude(0.18)
      .globeMaterial(new MeshPhongMaterial({ color: new Color('#0b1a2e'), emissive: new Color('#050b16'), shininess: 8 }))
      .polygonsTransitionDuration(0)
      .polygonCapCurvatureResolution(5)
      .polygonSideColor(() => 'rgba(10, 15, 26, 0.6)')
      .polygonStrokeColor((f) => (f.properties.LAND ? false : 'rgba(5, 7, 13, 0.85)'))
      .polygonAltitude((f) => altitudeFor(f))
      .polygonCapColor((f) => capColor(f))
      .polygonLabel((f) => props.current.labelOf(f))
      .onPolygonHover((f) => {
        hoverRef.current = f;
        el.style.cursor = f && !f.properties.LAND ? 'pointer' : 'grab';
        // Hover only changes cap colors: re-raising polygons rebuilds geometry.
        globe.polygonCapColor(globe.polygonCapColor());
      })
      .onPolygonClick((f, _e, coords) => props.current.onSelect(f, coords))
      .onGlobeClick(() => props.current.onSelect(null));

    function altitudeFor(f) {
      const { selectedKey: sel, featureKey: key } = props.current;
      if (f.properties.LAND) return LAND_ALT;
      return sel && key(f) === sel ? SELECT_ALT : BASE_ALT;
    }
    function capColor(f) {
      const { selectedKey: sel, featureKey: key, colorOf: color } = props.current;
      if (sel && key(f) === sel) return '#f8fafc';
      const c = color(f);
      return f === hoverRef.current && !f.properties.LAND ? lighten(c) : c;
    }
    function refresh() {
      globe.polygonAltitude(globe.polygonAltitude()).polygonCapColor(globe.polygonCapColor());
    }

    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 130;
    controls.maxDistance = 600;
    // Pause auto-rotation while the user interacts, resume after a while.
    let resume;
    controls.addEventListener('start', () => {
      controls.autoRotate = false;
      clearTimeout(resume);
    });
    controls.addEventListener('end', () => {
      clearTimeout(resume);
      resume = setTimeout(() => (controls.autoRotate = !props.current.selectedKey), 6000);
    });
    // Pull the camera back on narrow screens so the whole globe fits.
    globe.pointOfView({ lat: 25, lng: 10, altitude: el.clientWidth < 640 ? 3.6 : 2.4 });

    const resize = () => globe.width(el.clientWidth).height(el.clientHeight);
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    globeRef.current = { globe, refresh, controls };
    return () => {
      ro.disconnect();
      clearTimeout(resume);
      globe._destructor?.();
      el.innerHTML = '';
    };
  }, []);

  // Land first, under the territories. Feature objects are reused across
  // years, so the globe keeps their meshes and only builds what changed.
  useEffect(() => {
    globeRef.current?.globe.polygonsData(land.length ? [...land, ...features] : features);
  }, [features, land]);

  useEffect(() => {
    globeRef.current?.globe.polygonCapColor(globeRef.current.globe.polygonCapColor());
  }, [colorOf]);

  useEffect(() => {
    globeRef.current?.refresh();
  }, [selectedKey]);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    if (selectedKey) g.controls.autoRotate = false;
  }, [selectedKey]);

  useEffect(() => {
    const g = globeRef.current;
    if (!g || !flyTo) return;
    g.globe.pointOfView({ lat: flyTo.lat, lng: flyTo.lng, altitude: g.globe.pointOfView().altitude }, 900);
  }, [flyTo]);

  return <div ref={elRef} className="absolute inset-0" />;
}

function lighten(hex) {
  const c = new Color(hex);
  c.offsetHSL(0, 0, 0.12);
  return `#${c.getHexString()}`;
}

import { WebView } from "react-native-webview";
import { StyleSheet, View } from "react-native";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

type Props = {
  code: string;
  dest?: { lat: number; lng: number } | null;
  store?: { lat: number; lng: number } | null;
  height?: number;
};

function buildHtml({ code, dest, store }: Props) {
  const destJs = dest && dest.lat != null ? `[${dest.lat},${dest.lng}]` : "null";
  const storeJs = store && store.lat != null ? `[${store.lat},${store.lng}]` : "null";
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{height:100%;margin:0;padding:0;background:#eee}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var API="${BASE}/api/courier/order/${code}/location";
var dest=${destJs}, store=${storeJs};
var map=L.map('map',{zoomControl:true});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
var pts=[];
var destIcon=L.divIcon({html:'<div style="font-size:26px">🏠</div>',className:'',iconSize:[26,26],iconAnchor:[13,26]});
var storeIcon=L.divIcon({html:'<div style="font-size:24px">🏪</div>',className:'',iconSize:[24,24],iconAnchor:[12,24]});
var courierIcon=L.divIcon({html:'<div style="font-size:26px">🛵</div>',className:'',iconSize:[26,26],iconAnchor:[13,13]});
if(dest){L.marker(dest,{icon:destIcon}).addTo(map).bindPopup('Cliente');pts.push(dest);}
if(store){L.marker(store,{icon:storeIcon}).addTo(map).bindPopup('Loja');pts.push(store);}
if(pts.length){map.fitBounds(pts,{padding:[40,40]});}else{map.setView([-23.55,-46.63],13);}
var courierMarker=null, line=null, fitted=false, animReq=null;
function animateTo(marker, from, to, dur){
  if(animReq){cancelAnimationFrame(animReq);}
  var start=null;
  function step(ts){
    if(!start)start=ts;
    var t=Math.min(1,(ts-start)/dur);
    var lat=from[0]+(to[0]-from[0])*t;
    var lng=from[1]+(to[1]-from[1])*t;
    marker.setLatLng([lat,lng]);
    if(dest){
      if(line){map.removeLayer(line);}
      line=L.polyline([[lat,lng],dest],{color:'#FF5A00',weight:4,opacity:0.85,dashArray:'6,8'}).addTo(map);
    }
    if(t<1){animReq=requestAnimationFrame(step);}
  }
  animReq=requestAnimationFrame(step);
}
function upd(){
  fetch(API).then(function(r){return r.json();}).then(function(d){
    if(d&&d.lat!=null){
      var c=[d.lat,d.lng];
      if(!courierMarker){
        courierMarker=L.marker(c,{icon:courierIcon}).addTo(map).bindPopup('Entregador');
        if(dest){line=L.polyline([c,dest],{color:'#FF5A00',weight:4,opacity:0.85,dashArray:'6,8'}).addTo(map);}
      } else {
        var from=courierMarker.getLatLng();
        animateTo(courierMarker,[from.lat,from.lng],c,1600);
      }
      if(dest && !fitted){map.fitBounds([c,dest],{padding:[50,50]});fitted=true;}
    }
  }).catch(function(){});
}
upd(); setInterval(upd, 2000);
</script></body></html>`;
}

export default function LiveMap(props: Props) {
  const html = buildHtml(props);
  return (
    <View style={[styles.wrap, { height: props.height || 240 }]}>
      <WebView
        testID="live-map"
        originWhitelist={["*"]}
        source={{ html }}
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, overflow: "hidden", backgroundColor: "#eee" },
  web: { flex: 1, backgroundColor: "transparent" },
});

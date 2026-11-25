# Black Area — Hướng dẫn thiết kế hình ảnh (Blender) / Art & Modelling Guide (Blender)

> 🇻🇳 Tài liệu chuẩn cho **mọi** công trình, lính và phương tiện trong game. Trước khi dựng một asset mới hoặc làm lại asset cũ, đọc hết file này. Mọi asset phải theo đúng các quy định dưới đây.
>
> 🇬🇧 The reference for **every** structure, soldier and vehicle in the game. Read all of it before building a new asset or redoing an old one. Every asset must follow the rules below.

---

## 1. Nguyên tắc chung / General principles

| Quy định / Rule | 🇻🇳 Nghĩa là | 🇬🇧 Meaning |
|---|---|---|
| **Độc lập / Self-contained** | Mỗi asset có **một script Blender riêng**, tự dựng toàn bộ hình khối của nó: `tools/blender/<asset>_render.py` hoặc `ui/tools/<asset>_model_sheet.py`. Không import hay gọi hàm dựng hình (thân, cánh, mái, tháp…) của asset khác. Chỉ được dùng chung **hạ tầng**: camera, ánh sáng, bộ xuất sheet, vật liệu cơ bản, primitive (box, cylinder, loft…). | Each asset has **its own Blender script** that builds all of its geometry: `tools/blender/<asset>_render.py` or `ui/tools/<asset>_model_sheet.py`. Never import or call another asset's shape builders (fuselage, wing, roof, turret…). Only **infrastructure** may be shared: camera, lighting, sheet export, basic materials, primitives (box, cylinder, loft…). |
| **Chi tiết cao / High detail** | Dựng theo bản vẽ hoặc ảnh thật của chính model đó. Bộ phận nào nhìn thấy được ở cỡ sprite (cửa, kính, ống xả, càng, ăng-ten, gờ, panel…) thì phải có. | Model from that machine's own blueprints and photos. Every part that reads at sprite size (doors, glazing, exhausts, gear, antennas, ribs, panels…) must be there. |
| **Sắc nét / Sharp** | Render Cycles, khử nhiễu, siêu lấy mẫu (SS ≥ 2) rồi thu nhỏ. Cạnh rõ, không nhoè, không răng cưa. | Cycles render, denoised, supersampled (SS ≥ 2) then downscaled. Crisp edges, no blur, no jaggies. |
| **Sắc nét như thật / Photoreal sharpness** | **Mọi thiết kế** (công trình, lính, phương tiện, hiệu ứng, hố đạn, địa hình…) phải sắc nét và chân thật **tương đương ngoài thực tế**: nhìn như ảnh chụp vật thật thu nhỏ, không mờ, không bệt, không giả. Render ở độ phân giải đủ lớn để khi phóng to tối đa trong game (kể cả màn hình HiDPI) ảnh không bị phóng to quá kích thước gốc; chất liệu có vân thật (đất, bê tông, kim loại, sơn…), có bóng đổ và chi tiết nhỏ. Ảnh chưa đạt thì render lại, không đưa vào game. | **Every design** (structures, soldiers, vehicles, effects, craters, terrain…) must be as sharp and realistic **as the real thing**: like a scaled-down photo of the real object, never blurry, flat or fake. Render at a resolution large enough that the game's maximum zoom (HiDPI screens included) never enlarges it past its native size; materials carry real texture (soil, concrete, metal, paint…), cast shadows and fine detail. Art that falls short is rendered again, never shipped. |
| **Không như lego / No Lego look** | Không vẽ phẳng một màu, không viền đen bao quanh. Hình khối phải có sáng tối thật từ ánh sáng 3D. | No flat single-colour fills, no black outlines. Shapes take real light and shade from 3D lighting. |
| **Không như hoạt hình / No cartoon look** | Không tô màu bão hoà và không tô bóng kiểu cel-shading. Màu phải gần màu thật của vật liệu (thép, bê tông, sơn quân sự, kính, gạch…). | No saturated colours, no cel shading. Colours stay close to the real material (steel, concrete, military paint, glass, brick…). |
| **Khối và bo đúng chỗ / Hard where hard, round where round** | Chỗ ngoài đời là khối cứng (giáp xe tăng, tường, khung thép, cạnh mái) thì để **góc vuông, cạnh sắc**. Chỗ ngoài đời là bo tròn (thân máy bay, mũi, nắp động cơ, mái vòm, mép bánh, thân người) thì **bo góc hoặc làm mịn** (bevel, subdivision, `shade_smooth_by_angle` khoảng 35–40°). Không bo tất cả, cũng không vuông tất cả. | What is hard in reality (tank armour, walls, steel frames, roof edges) keeps **square corners and sharp edges**. What is rounded in reality (fuselages, noses, cowlings, domes, tyres, bodies) gets **bevels or smoothing** (bevel, subdivision, `shade_smooth_by_angle` about 35–40°). Neither everything rounded nor everything boxy. |
| **Giữ tên hiển thị / Keep display names** | Đổi hình hay đổi code bên trong cũng không đổi tên hiện trên màn hình. | New art or internals never change the on-screen name. |
| **Cả người chơi và AI / Player and AI alike** | Asset và luật đi kèm dùng chung cho người chơi và AI. | Assets and their rules apply to the player and the AI alike. |
| **Mã thiết kế / Design code** | Mỗi thiết kế có **một mã thiết kế riêng** (`BUILDING_DESIGNS` trong `ui/src/constants.ts`); game chọn ảnh và bố cục theo mã, không theo tên phe. Các phe dùng thiết kế **cùng kiểu dáng, chỉ khác line màu phe** thì dùng **chung một mã** và **chỉ render một ảnh**; game tự đổi line sang màu phe sở hữu (`PictureSpec.recolor`). Khác hình khối hoặc vật liệu (ví dụ nền cát, bê tông màu cát) là **mã khác**, render ảnh riêng. Ví dụ: sân bay `middleRunway` (Nga, Trung Quốc) / `middleRunwaySand` (Hồi giáo); nhà máy điện `coolingTower` (Nga, Trung Quốc) / `coolingTowerSand` (Hồi giáo). | Every design has **its own design code** (`BUILDING_DESIGNS` in `ui/src/constants.ts`); the game picks the picture and layout by code, not by nation. Nations whose design has **the same shape and differs only in the team line** share **one code** and **one render**; the game recolours the line to the owner (`PictureSpec.recolor`). A different shape or material (e.g. sand ground, sand-tone concrete) is **a different code** with its own render. Examples: airfield `middleRunway` (Russia, China) / `middleRunwaySand` (Islamic); power plant `coolingTower` (Russia, China) / `coolingTowerSand` (Islamic). |
| **Trạng thái hư hại / Damage states** | Mỗi công trình có **4 ảnh theo máu còn lại**: nguyên vẹn (trên 80%), **≤ 80%** (cháy xém, kính vỡ, gờ và lan can sứt mẻ, vài mảnh vụn), **≤ 50%** (**hư hại một nửa toà nhà**: khoảng một nửa khối nhà — ví dụ một cánh và nửa khối chính — bị phá toang hoặc sập, mất mái phần đó, mép vỡ lởm chởm lộ sàn và dầm, đổ nát; nửa còn lại vẫn đứng, hư hại nhẹ hơn), **≤ 20%** (**sụp đổ hoàn toàn**: toà nhà thành đống đổ nát phủ kín nền, chỉ còn chân tường, chân cột và vài mảnh góc gãy thấp, dầm cháy đen, nền cháy xém). Cả 4 dựng từ **cùng một script** (tham số `damage` 0–3), **cùng kiến trúc, cùng gốc ảnh** (ảnh không nhảy khi đổi trạng thái); tên file `building-<tên>-d1/-d2/-d3`. Hư hại phải **như thật** (mép vỡ lởm chởm, lộ cốt thép / dầm / sàn, muội khói), không kiểu hoạt hình. Phần còn lại vẫn giữ **line màu phe**; vị trí cột cờ giữ trên phần còn đứng hoặc trên nền. Trạng thái tính từ máu (sửa lên lại thì ảnh trở lại), không lưu vào save. Công trình chung mã thiết kế thì chung bộ 4 ảnh. | Every structure has **4 pictures by HP left**: intact (above 80 %), **≤ 80 %** (scorch marks, broken panes, chipped cornice and balustrade, a few chunks of rubble), **≤ 50 %** (**half the building destroyed**: about half the massing — e.g. one wing and half the main block — blown open or collapsed, its roof gone, jagged breaks showing floors and beams, rubble; the other half still standing with lighter damage), **≤ 20 %** (**completely collapsed**: the building is a rubble field over its plot, only wall stubs, column bases and a few low broken corner fragments left, charred beams, scorched ground). All 4 come from **the same script** (a `damage` 0–3 parameter), **same architecture, same origin** (the sprite never jumps between states); files `building-<name>-d1/-d2/-d3`. Damage looks **real** (jagged breaks, exposed rebar / beams / floors, soot), never cartoonish. The remaining parts keep the **team line**; the flag pole stays on what still stands or on the ground. The state follows HP (mending restores it) and is never saved. Structures sharing a design code share the 4 pictures. |

---

## 2. Hệ toạ độ và góc nhìn / Coordinates and view

- **Phép chiếu isometric / Isometric projection** — `ISO_X = 0.5`, `ISO_Y = 0.25` (`ui/src/constants.ts`).
  - 🇻🇳 Một đơn vị thế giới được vẽ thành 0,5 px theo chiều ngang và 0,25 px theo chiều dọc màn hình.
  - 🇬🇧 One world unit is drawn 0.5 px across and 0.25 px down the screen.
- **Camera Blender / Blender camera** — orthographic, `rotation_euler.x = 60°`, `SIN_E = 0.5`.
  - 🇻🇳 Chiếu **trực giao**, nghiêng **30°** so với mặt đất; chiều sâu mặt đất bị nén còn một nửa.
  - 🇬🇧 **Orthographic**, **30°** above the ground; ground depth is squashed to half.
- **Trục mô hình / Model axes** — `u` → mũi / nose, `v` → trái / left, `z` → lên / up.
  - 🇻🇳 Đơn vị là **mét** cho phương tiện và lính. Công trình dùng đơn vị nghệ thuật của `tools/blender/kit.py`.
  - 🇬🇧 Units are **metres** for vehicles and soldiers. Structures use the art units of `tools/blender/kit.py`.
- **Định nghĩa kích thước / Dimension definitions** — 🇻🇳 dùng thống nhất khi người dùng yêu cầu chỉnh kích thước · 🇬🇧 used whenever the user asks for a size change:

  | Từ / Word | Trục / Axis | 🇻🇳 Nghĩa | 🇬🇧 Meaning |
  |---|---|---|---|
  | **Chiều dài / Length** | `u` | Mũi ↔ đuôi (đầu xe ↔ cuối xe) | Nose ↔ tail |
  | **Chiều rộng / Width** | `v` | Hông trái ↔ hông phải, **tính mọi bộ phận nhô ra** (cánh ngắn, váy xích, gương…) | Left ↔ right side, **including everything that sticks out** (stub wings, skirts, mirrors…) |
  | **Chiều cao / Height** | `z` | Mặt đất ↔ điểm cao nhất | Ground ↔ highest point |

  - 🇻🇳 Áp dụng cho **mọi asset**: phương tiện, máy bay, lính và công trình. Lính: `u` = hướng mặt nhìn. Công trình: `u` = hướng mặt tiền nhìn ra, `v` = dọc theo mặt tiền.
  - 🇬🇧 Applies to **every asset**: vehicles, aircraft, soldiers and structures. Soldiers: `u` = the way they face. Structures: `u` = the way the front faces, `v` = along the front.
  - 🇻🇳 Đây là kích thước **của mô hình**, không phải bề ngang/dọc trên màn hình (trên màn hình còn phụ thuộc hướng quay và phép chiếu).
  - 🇬🇧 These are **model** dimensions, not the on-screen extent (which depends on the facing and the projection).
  - 🇻🇳 Khi người dùng nói "trục u / v / z = X so với Y", chỉnh tỉ lệ vẽ trong game (hoặc mô hình) để kích thước đó của asset bằng X lần cùng trục của Y, đo trên mô hình và quy ra iso px. Không cần hỏi lại.
  - 🇬🇧 When the user says "axis u / v / z = X of Y", scale the asset (in-game draw scale or the model) so that dimension equals X times the same axis of Y, measured on the models and converted to iso px. No need to ask again.
- **Ánh sáng chuẩn / Standard lighting** — 🇻🇳 giống sprite xe tăng · 🇬🇧 the same as the tank sheets:
  - Đèn chính / Key light (SUN): hướng / direction `(-0.45, -0.35, 0.82)`, năng lượng / energy 2.3–3.2, góc / angle 3°.
  - Đèn viền / Rim light (SUN): năng lượng / energy ≈ 0.9; 🇻🇳 màu hơi lạnh, chiếu từ phía phải · 🇬🇧 slightly cool, from the right.
  - Bầu trời / Sky: 🇻🇳 xanh xám nhạt · 🇬🇧 pale blue-grey; cường độ / strength 0.45–0.75.
  - Màu / Colour: `view_transform = "Standard"`, look `"Medium Contrast"`.
  - Bóng đổ / Ground shadow: 🇻🇳 nếu cần, dùng mặt phẳng · 🇬🇧 when needed, use a plane with `is_shadow_catcher`.

---

## 3. Hướng quay / Facings

🇻🇳 Bắt buộc cho mọi phương tiện và máy bay. · 🇬🇧 Mandatory for every vehicle and aircraft.

- **32 hướng / 32 facings** — 11,25° / 11.25° apart, kiểu / style Red Alert 2.
- **Cột 0 / Column 0**
  - 🇻🇳 Mũi hướng **thẳng lên trên màn hình** (hướng Bắc). Các cột tiếp theo đi **theo chiều kim đồng hồ** (Đông Bắc → Đông → Đông Nam → Nam …).
  - 🇬🇧 Nose pointing **straight up the screen** (North). Following columns go **clockwise** (NE → E → SE → S …).
- **Công thức quay / Rotation formula** — `rig.rotation_euler.z = atan2(cos(h) / SIN_E, sin(h))`, với / with `h = k / 32 · 2π` (xem / see `tools/blender/t90m_sheet.py`).
- **Phía game / Game side**
  - 🇻🇳 Game tự đọc số cột từ chiều rộng ảnh (`AircraftSheets.ts`). **Không** làm sheet 16 hướng cho asset mới.
  - 🇬🇧 The game reads the column count from the image width (`AircraftSheets.ts`). **No** 16-facing sheets for new assets.
- **Lính / Soldiers**
  - 🇻🇳 8 hướng (layout `dir8` của `InfantryArt`), cùng thứ tự: bắt đầu từ Bắc, theo chiều kim đồng hồ.
  - 🇬🇧 8 facings (`InfantryArt` `dir8` layout), same order: starting at North, clockwise.
- **Công trình / Structures**
  - 🇻🇳 Chỉ một góc nhìn; bản quay ngang được tạo bằng cách lật gương trong game.
  - 🇬🇧 A single view; the turned plot is a mirror made in the game.

---

## 4. Bố cục sheet theo loại / Sheet layout by kind

| Loại / Kind | File | Ô / Cell (px) | Cột × hàng / Cols × rows | Hàng / Rows |
|---|---|---|---|---|
| Xe tăng, xe bọc thép / Tanks, AFVs | `tank-<model>-hull.png`, `-turret.png` | 64, lưu ở / stored at 256 | 32 × 1 | 🇻🇳 thân có bóng đổ; tháp pháo vẽ chồng lên, quay riêng · 🇬🇧 hull with its shadow; turret drawn on top, turns on its own |
| Máy bay (ném bom, AWACS, vận tải, tiêm kích mới) / Aircraft (bombers, AWACS, transports, new fighters) | `<model>-<faction>.png` | 192 | 32 × 9 | 0 đậu / parked · 1–2 bay / flying · 3 mở cửa hàng / ramp · 4 nghiêng trái / bank left · 5 nghiêng phải / bank right · 6–7 rơi / crashing · 8 bóng / shadow |
| Máy bay cánh cụp/xoè / Swing-wing aircraft | 🇻🇳 thêm / 🇬🇧 plus `<model>-<faction>-turbo.png` | 192 | 32 × 9 | 🇻🇳 bản cánh cụp, game dùng khi bật Turbo · 🇬🇧 wings swept, used while the turbo runs |
| Lính / Soldiers | `<sheet>.png` | 128 | 8 × (11 hoặc / or 27) | 🇻🇳 các khung hình động tác · 🇬🇧 animation frames (`InfantryArt`) |
| Công trình / Structures | `building-<kind>-<faction>.png` | 🇻🇳 theo nền / 🇬🇧 by plot | 1 ảnh / 1 image | 🇻🇳 `kit.render(name, footprint, height)` in ra `originX/originY` để ghi vào `PictureSpec` · 🇬🇧 prints `originX/originY` for the `PictureSpec` |

**Thư mục sprite / Sprite folders**
- 🇻🇳 Script vẫn ghi PNG vào `ui/public/sprites/`. Chạy `python tools/to_webp.py`: đổi sang WebP rồi tự xếp vào `sprites/<phe>/<nhóm>/` (nhiều ảnh cùng nhóm, ví dụ radar + khung ăng-ten, các mảnh tường) hoặc `sprites/<phe>/` (chỉ một ảnh), và cập nhật `ui/src/render/spriteManifest.ts`. Thủ đô các nước khác (`building-nation-<nước>`) xếp vào `sprites/capitals/<nước>/` theo cùng quy tắc. Ảnh không thuộc phe nào nằm ở gốc `sprites/`. Trong code luôn lấy đường dẫn qua `spriteUrl(file)`.
- 🇬🇧 Scripts still write their PNG into `ui/public/sprites/`. Run `python tools/to_webp.py`: it converts to WebP, then sorts files into `sprites/<nation>/<group>/` (several in one group, e.g. radar + antenna frames, wall pieces) or `sprites/<nation>/` (a single one) and refreshes `ui/src/render/spriteManifest.ts`. The other nations' capitals (`building-nation-<country>`) go under `sprites/capitals/<country>/` the same way. Sprites of no nation stay at the `sprites/` root. In code always build the path with `spriteUrl(file)`.
- 🇻🇳 **Không giữ PNG:** xong một asset (đã chạy `tools/to_webp.py`, đã có bản WebP) thì **không giữ lại file PNG** nào trong `ui/public/sprites/`; `to_webp.py` tự xoá PNG sau khi đổi. PNG chỉ là file trung gian lúc render; ảnh kiểm tra / xem thử (`-preview`, `-check-*`) cũng xoá khi xong. Ngoại lệ: ảnh ngoài thư mục sprite mà code đọc trực tiếp dạng `.png` (logo phe `emblems/`, `favicon.png`, `logo.png`, `research-lab/`, `data/earth.png`).
- 🇬🇧 **No PNG kept:** once an asset is done (`tools/to_webp.py` has run, the WebP exists), **no PNG stays** in `ui/public/sprites/`; `to_webp.py` deletes them after converting. PNGs are only render intermediates; check / preview images (`-preview`, `-check-*`) are deleted when done too. Exceptions: images outside the sprite folder that the code reads directly as `.png` (faction `emblems/`, `favicon.png`, `logo.png`, `research-lab/`, `data/earth.png`).

**Kích thước trên màn hình / On-screen size**
- 🇻🇳 Đo chiều dài theo phương ngang, đơn vị iso px. Mọi model trong cùng một nhóm phải có cùng chiều dài.
- 🇬🇧 Length side-on, in iso px. Every model in a group has the same length.

| Nhóm / Group | Chiều dài / Length |
|---|---|
| Tiêm kích, drone, **AWACS** / Fighters, drones, **AWACS** | 9.5 |
| Máy bay vận tải / Transports | 13 |
| Máy bay ném bom (chuẩn: Tu-160) / Bombers (Tu-160 standard) | 15.2 |
| Xe tăng / Tanks | 🇻🇳 dùng chung tỉ lệ px/m với sheet M1A2 · 🇬🇧 the M1A2 sheet's px per metre (`t90m_sheet.py`) |

**Nền công trình / Structure plots**
- 🇻🇳 Khối nhà phải **phủ kín nền** đã khai báo (ví dụ thủ đô 5×5, Kremlin 5×4), bố cục **cân đối**, không để khoảng trống lớn.
- 🇬🇧 The building must **fill its declared plot** (e.g. capital 5×5, Kremlin 5×4), **balanced**, with no large empty areas.

---

## 5. Hình khối và mức chi tiết / Shapes and detail

### Phương tiện mặt đất / Ground vehicles
- **Giáp / Armour**
  - 🇻🇳 Các tấm phẳng, cạnh vát nhỏ (bevel 1–3 cm).
  - 🇬🇧 Flat plates with small chamfers (bevel 1–3 cm).
- **Bánh và xích / Wheels and tracks**
  - 🇻🇳 Từng bánh là một khối tròn riêng, mắt xích có gân.
  - 🇬🇧 Each road wheel is its own round body; track links are ribbed.
- **Vật dụng ngoài / External kit**
  - 🇻🇳 Thùng đồ, móc kéo, đèn, kính tiềm vọng, súng máy trên nóc.
  - 🇬🇧 Stowage bins, tow hooks, lights, periscopes, roof machine gun.
- **Nòng pháo / Gun barrel**
  - 🇻🇳 Hình trụ có ống hút khói và chụp đầu nòng.
  - 🇬🇧 A cylinder with a fume extractor and a muzzle reference sensor.
- **Tỉ lệ chiều cao / Height scale**
  - 🇻🇳 Có thể tăng **1,6 lần** để xe trông chắc, "chunky" như RA2 (`HEIGHT_SCALE`).
  - 🇬🇧 May be raised **1.6×** for a chunky, RA2-style look (`HEIGHT_SCALE`).

### Máy bay / Aircraft
- **Thân / Fuselage**
  - 🇻🇳 To tròn, rõ khối. Khi thật quá mảnh, tăng bán kính thân 1,5–1,9 lần, nhưng giữ nguyên cánh.
  - 🇬🇧 Full and round. When the real one is too slim, widen the body 1.5–1.9×, but keep the wings as they are.
- **Mũi / Nose**
  - 🇻🇳 Theo đúng loại máy bay. Máy bay dân dụng/vận tải mũi tù, tròn kiểu Boeing; máy bay chiến đấu mũi nhọn.
  - 🇬🇧 True to type. Airliners and transports have a blunt, round Boeing-style nose; fighters have a pointed one.
- **Kính buồng lái / Cockpit glazing**
  - 🇻🇳 Làm thành **tấm kính thật**, là vật thể riêng nhô nhẹ khỏi vỏ, có khung. Không chỉ tô màu lên vỏ.
  - 🇬🇧 **Real glass panes**: separate objects just proud of the skin, with frames. Not paint on the skin.
- **Cánh / Wings**
  - 🇻🇳 Có độ dày, mép trước bo tròn, mép sau sắc. Có winglet, gờ chắn trên cánh, hộp ray cánh tà nếu máy bay thật có.
  - 🇬🇧 With thickness, a rounded leading edge and a sharp trailing edge. Add winglets, wing fences and flap-track fairings where the real aircraft has them.
- **Động cơ / Engines**
  - 🇻🇳 Cửa hút gió tối, có độ sâu. Ống xả màu kim loại. Giá treo động cơ là khối riêng.
  - 🇬🇧 Dark intakes with depth, metal nozzles, pylons as separate bodies.
- **Cánh cụp/xoè / Swing wings**
  - 🇻🇳 Dựng 2 tư thế và xuất 2 sheet riêng.
  - 🇬🇧 Build both positions and export two sheets.

### Công trình / Structures
- **Tường / Walls**
  - 🇻🇳 Có độ dày.
  - 🇬🇧 They have thickness.
- **Cửa sổ / Windows**
  - 🇻🇳 Có khung, bậu, kính lùi vào trong tường, không vẽ phẳng.
  - 🇬🇧 Frames, sills, glass set back into the wall; never painted flat.
- **Mái / Roofs** — 🇻🇳 theo đúng kiến trúc thật · 🇬🇧 true to the real architecture:
  - mái điện Trung Hoa / Chinese hall roof: 🇻🇳 cong, có đường ngói, nóc, góc vút · 🇬🇧 curved, tile ribs, ridge, swept corners;
  - mái mansard / mansard roof: 🇻🇳 dốc ngắn quanh mép, mặt trên phẳng · 🇬🇧 a short slope round the eaves, flat top;
  - mái tôn nhà xưởng / factory roof: 🇻🇳 dạng răng cưa · 🇬🇧 sawtooth.
- **Mái không đơn điệu / No plain roofs**
  - 🇻🇳 Mọi mặt mái và **hông mái** (các mặt dốc, gờ hông) không được để trơn một mảng màu. Phải có chi tiết nhìn rõ ở cỡ sprite: hàng ngói / gân ngói hoặc đường ghép tôn (standing seam), gờ nóc và gờ hông nổi, mép mái có viền hoặc đầu ngói, và ít nhất một điểm nhấn theo kiến trúc thật (cửa mái, tượng nóc, chóp, linh thú, lan can mái…). Mái nhiều tầng hoặc giật cấp khi kiến trúc thật có. Chi tiết phải phủ **đều trên mọi mặt mái** (trước, sau, hai hông), không chỗ có chỗ không.
  - 🇬🇧 No roof face or **hip** (slopes, hip ridges) may be a bare single-colour slab. It needs detail that reads at sprite size: tile rows / ribs or standing seams, raised ridge and hip lines, a trimmed eave or tile caps, and at least one accent true to the architecture (dormers, ridge ornaments, finial, ridge beasts, roof balustrade…). Use tiered or stepped roofs where the real architecture has them. The detail covers **every roof face evenly** (front, back and both hips), never on some faces only.
- **Không trùng kiểu dáng / No shared shapes**
  - 🇻🇳 Mỗi công trình (kể cả cùng loại nhưng khác phe) phải có **kiểu dáng, hình khối và bóng dáng riêng**. Không dùng lại cùng một khối nền, cùng bố cục hay cùng hình dạng rồi chỉ đổi màu / đổi chi tiết nhỏ. Hai công trình đặt cạnh nhau phải phân biệt được ngay bằng hình dáng.
  - 🇬🇧 Every structure (including the same kind for different nations) has its **own form, massing and silhouette**. Never reuse one base block, layout or shape and only change colours or small details. Two structures side by side must be told apart by shape alone.
- **Mã thiết kế / Design codes**
  - 🇻🇳 Mỗi thiết kế có **mã thiết kế riêng** (`BUILDING_DESIGNS` trong `ui/src/constants.ts`). Hai phe dùng thiết kế **cùng kiểu dáng, chỉ khác line màu phe** thì dùng **chung một mã** và chung **một ảnh render**; game tự đổi line sang màu phe sở hữu (`PictureSpec.recolor`). Chỉ render ảnh riêng khi hình khối hoặc vật liệu khác nhau (ví dụ nền cát) — khi đó là mã thiết kế khác.
  - 🇬🇧 Every design has **its own design code** (`BUILDING_DESIGNS` in `ui/src/constants.ts`). Nations whose design has **the same shape and differs only in the team line** share **one code** and **one render**; the game recolours the line to the owner (`PictureSpec.recolor`). Render a separate picture only when shape or materials differ (e.g. sand ground) — that is a different design code.
- **Chi tiết kiến trúc / Architectural detail**
  - 🇻🇳 Gờ phào, trụ áp tường, lan can, bậc thềm, chân đế.
  - 🇬🇧 Cornices, pilasters, balustrades, steps, plinths.
- **Cây thật / Real trees**
  - 🇻🇳 Cây (khi có) phải dựng như cây thật của đúng loài: thân thuôn có độ nghiêng, cành vươn ra, tán là nhiều cụm lá không đều (khối gồ ghề, hai sắc xanh), không dùng hình nón / quả cầu trơn.
  - 🇬🇧 Trees (when present) are modelled like real trees of the right species: a tapering, slightly leaning trunk, branches reaching out, a canopy of irregular leaf clumps (rough blobs, two greens), never plain cones or spheres.
- **Không tự thêm / Nothing extra**
  - 🇻🇳 **Không** đặt cây, hàng rào, cổng hay vật trang trí khi người dùng không yêu cầu.
  - 🇬🇧 **No** trees, fences, gates or decoration unless the user asks for them.

### Lính / Soldiers
- **Tỉ lệ và trang bị / Proportions and kit**
  - 🇻🇳 Tỉ lệ người thật, mặc trang bị của đúng phe (mũ, áo giáp, súng).
  - 🇬🇧 Real human proportions, in their nation's kit (helmet, vest, weapon).
- **Khối / Shapes**
  - 🇻🇳 Khối người bo tròn. Súng và trang bị là khối cứng.
  - 🇬🇧 Rounded body shapes; weapons and gear as hard shapes.

---

## 6. Vật liệu và màu sắc / Materials and colour

🇻🇳 Dùng **Principled BSDF**. · 🇬🇧 Use **Principled BSDF**.

| Vật liệu / Material | Roughness |
|---|---|
| Sơn quân sự / Military paint | 0.5–0.8 |
| Kim loại trần / Bare metal (metallic 0.7–1) | 0.3–0.45 |
| Kính / Glass | 0.05–0.12 |

- **Độ chân thực / Realism**
  - 🇻🇳 Chỗ lõm dùng ambient occlusion (khoảng 0,15–0,6 m).
  - 🇬🇧 Ambient occlusion in recesses (about 0.15–0.6 m).
  - 🇻🇳 Đường ghép tấm vỏ (panel line) sẫm hơn nền 10–25%.
  - 🇬🇧 Panel lines 10–25 % darker than the base.
  - 🇻🇳 Bẩn nhẹ (noise 3–5%), không làm loang lổ.
  - 🇬🇧 Light grime (3–5 % noise), never blotchy.
- **Màu phe / Faction colours**
  - 🇻🇳 Dùng `TEAM` trong `kit.py` cho dải màu nhận diện phe. Màu thân chính theo màu thật của model, ví dụ C-17 xanh xám đậm, Il-76 trắng có dải xanh, Tu-160 trắng.
  - 🇬🇧 Use `TEAM` in `kit.py` for the faction identity band. The main colour is the real one, e.g. C-17 dark blue-grey, Il-76 white with a blue cheatline, Tu-160 white.
  - 🇻🇳 **Bắt buộc:** mọi **công trình, lính và phương tiện** luôn phải có ít nhất một **line nhận dạng màu phe** (dải, viền, sọc hoặc mảng tô bằng đúng màu `TEAM`), nhìn rõ ở cỡ sprite. Đây là phần game đổi sang màu của chủ mới khi công trình / đơn vị bị chiếm, nên phải dùng đúng mã `TEAM`, không pha, không đổ bóng màu khác lên. Ví dụ: sân bay có line màu phe dọc mép bãi đỗ, ở đầu mỗi chỗ đỗ, ở đai tháp chỉ huy và nắp bồn nhiên liệu.
  - 🇬🇧 **Required:** every **structure, soldier and vehicle** always carries at least one **faction identity line** (a band, trim, stripe or patch in the exact `TEAM` colour) that reads at sprite size. It is the part the game recolours to the new owner when the structure / unit is taken, so use the exact `TEAM` value, unmixed. Example: the airfield has the team line along the apron edges, at the head of every stand, on the tower band and on the fuel-tank caps.
- **Cờ và phù hiệu / Flags and markings**
  - 🇻🇳 Cờ phe luôn dùng **thiết kế cờ trong game** (`ui/src/render/Flags.ts`). Không dùng cờ quốc gia ngoài đời.
  - 🇬🇧 Faction flags always use the **game's own flag designs** (`ui/src/render/Flags.ts`), never real-world national flags.
  - 🇻🇳 Phù hiệu nhỏ: chỉ những gì nhìn thấy được ở cỡ sprite.
  - 🇬🇧 Small markings: only what reads at sprite size.
  - 🇻🇳 Chữ quá nhỏ để đọc thì vẽ thành khối tối thể hiện dòng chữ.
  - 🇬🇧 Lettering too small to read is drawn as dark blocks along the line of text.
- **Cờ trên cột / Flags on poles**
  - 🇻🇳 Mọi cờ treo dùng chung một cỡ `FLAG_W × FLAG_H = 18 × 11` (`Flags.ts`). Không truyền kích thước riêng.
  - 🇬🇧 Every flag on a pole uses one size, `FLAG_W × FLAG_H = 18 × 11` (`Flags.ts`). Never pass a size of your own.

---

## 7. Quy trình làm một asset / Workflow for one asset

1. **Thu thập / Gather**
   - 🇻🇳 Bản vẽ 3 hình chiếu và ảnh thật. Ghi lại kích thước thật (dài, rộng, cao, sải cánh).
   - 🇬🇧 Three-view blueprints and photos. Note the real dimensions (length, width, height, span).
2. **Dựng script riêng / Build its own script**
   - 🇻🇳 `tools/blender/<asset>_render.py`. Toàn bộ hình khối viết trong file đó; ghi các thông số cần nhớ vào docstring ở đầu file.
   - 🇬🇧 `tools/blender/<asset>_render.py`. All of its geometry lives in that file; record the key numbers in the docstring at the top.
3. **Xem trước nhanh / Quick preview**
   - 🇻🇳 Render một vài hướng ở độ phân giải thấp và soi kỹ:
   - 🇬🇧 Render a few facings at low resolution and check carefully:
     - đúng hướng chưa? / facing right? (cột 0 / column 0 = mũi hướng lên / nose up)
     - khối và bo đã đúng chỗ chưa? / hard and rounded in the right places?
     - màu đã đúng chưa? / colours right?
     - có chỗ nào hiện đen, thủng hay trùng mặt không? / any black, missing or z-fighting faces?
4. **Render đầy đủ / Full render**
   - 🇻🇳 Cycles, 32 mẫu trở lên, khử nhiễu, 32 hướng, SS = 2. Có nhiều asset thì chạy **song song**, mỗi tiến trình ghi ra file riêng.
   - 🇬🇧 Cycles, ≥ 32 samples, denoised, 32 facings, SS = 2. With several assets, run them **in parallel**, each process writing its own files.
5. **Nối vào game / Wire it in**
   - 🇻🇳 Khai báo sheet và chiều dài theo nhóm (mục 4). Với công trình: chép `originX/originY` mà script in ra vào `PictureSpec`.
   - 🇬🇧 Register the sheet and its group length (section 4). For structures: copy the printed `originX/originY` into the `PictureSpec`.
6. **Kiểm tra / Check**
   - 🇻🇳 `npx tsc --noEmit -p .` trong `ui/` không báo lỗi; xem trong trang **Asset game** và trong trận.
   - 🇬🇧 `npx tsc --noEmit -p .` in `ui/` passes; check it on the **Game assets** page and in a match.
7. **Phiên bản / Version**
   - 🇻🇳 Tăng `GAME_VERSION` (`ui/src/constants.ts`), ghi cùng số vào `ui/RULE.html` và `README.md`, kèm một dòng trong lịch sử thay đổi của `RULE.html`.
   - 🇬🇧 Bump `GAME_VERSION` (`ui/src/constants.ts`), write the same number into `ui/RULE.html` and `README.md`, and add a line to the `RULE.html` changelog.

---

## 8. Danh sách kiểm tra trước khi giao / Checklist before hand-off

- [ ] Script riêng, không gọi hàm dựng hình của asset khác / Own script, no other asset's shape builders
- [ ] 32 hướng (lính: 8), cột 0 = Bắc, theo chiều kim đồng hồ / 32 facings (soldiers: 8), column 0 = North, clockwise
- [ ] Camera orthographic 30°, ánh sáng chuẩn mục 2 / Orthographic 30° camera, standard lighting (section 2)
- [ ] Kích thước trên màn hình đúng theo nhóm, công trình phủ kín nền / On-screen size per group, structures fill their plot
- [ ] Khối cứng chỗ cần khối, bo tròn chỗ cần bo / Hard where hard, rounded where rounded
- [ ] Mái và hông mái có chi tiết, không trơn đơn điệu / Roofs and hips detailed, never plain
- [ ] Kiểu dáng riêng, không trùng hình khối với công trình khác / Own shape, no massing shared with another structure
- [ ] Chi tiết đủ, sắc nét, không như lego hay hoạt hình / Detailed, sharp, no Lego or cartoon look
- [ ] Sắc nét như thật, tương đương ngoài thực tế; không bị phóng to quá kích thước gốc ở mức zoom tối đa / Photoreal sharpness, as the real thing; never enlarged past native size at max zoom
- [ ] Màu thật, cờ và phù hiệu theo thiết kế trong game / Real colours; game flag and marking designs
- [ ] Có line nhận dạng màu phe (`TEAM`) trên công trình, lính, phương tiện / Faction identity line (`TEAM`) on structures, soldiers, vehicles
- [ ] Tên hiển thị không đổi, áp dụng cho cả người chơi và AI / Display names unchanged; player and AI alike
- [ ] Có mã thiết kế; cùng kiểu dáng chỉ khác line thì chung mã, chung một ảnh (không render ảnh trùng) / Has a design code; same shape differing only in the team line shares the code and one render (no duplicate renders)
- [ ] Công trình có đủ 4 trạng thái hư hại (nguyên vẹn, ≤ 80%, ≤ 50%, ≤ 20%) từ cùng script, cùng gốc ảnh / Structure has all 4 damage states (intact, ≤ 80 %, ≤ 50 %, ≤ 20 %) from the same script, same origin
- [ ] Đã đổi sang WebP, không còn PNG trong `ui/public/sprites/` / Converted to WebP, no PNG left in `ui/public/sprites/`
- [ ] `tsc` không lỗi, đã tăng phiên bản, đã cập nhật RULE và README / `tsc` passes, version bumped, RULE and README updated

## 9. Logo phe (prompt AI) / Faction emblems (AI prompts)

Logo phe nằm ở `ui/public/emblems/<id>.png` (512 × 512, PNG nền trong suốt, hình cân giữa, chừa lề ~8 px).
Tạo bằng công cụ AI: ghép **[prompt phe] + [khối phong cách]**, xuất tối thiểu 1024 × 1024. Nếu ảnh có nền caro giả,
cắt nền rồi thu về 512 px trước khi thay vào game.
Faction emblems live in `ui/public/emblems/<id>.png` (512 × 512 transparent PNG, centred, ~8 px margin). Generate with an
AI tool as **[faction prompt] + [style block]** at 1024 × 1024 or more; strip any fake checkerboard, then scale to 512 px.

### Khối phong cách chung / Shared style block

```
STYLE: low-poly geometric emblem, flat vector logo, faceted polygons with sharp straight edges,
gold and black only — 3 gold tones (light #FFE08A, mid #E8B84A, dark #B98A2C) plus solid black #0D0D0D,
thin black seams between every facet, thick uniform black outer outline around the whole silhouette,
no gradients, no glow, no shadow, no texture, no text.
Single subject, centered, filling about 85% of the frame with even empty margin.
Square 1:1, TRANSPARENT BACKGROUND (PNG with alpha channel), no background color, no backdrop,
isolated emblem only, high resolution, crisp clean edges,
esports / military crest logo look, consistent with a set of 5 matching emblems.
```

### Prompt từng phe / Per-faction prompts

**`usa.png` — Paxamerica: đại bàng, quay PHẢI / eagle, facing right**
```
Bald eagle head in side profile facing RIGHT, fierce eye, large hooked beak pointing right,
swept-back crest feathers on top, head and neck mostly black with gold feather streaks,
gold beak and gold brow plate.
```

**`europe.png` — European Union: sư tử đội vương miện, quay TRÁI / crowned lion, facing left**
```
Lion head in side profile facing LEFT, wearing a small 3-point royal crown on top,
gold face and muzzle, flowing black mane with sharp gold mane locks, calm proud expression,
crown in gold sitting slightly tilted on the head.
```

**`russia.png` — Nordursia: gấu, quay TRÁI / bear, facing left**
```
Bear head in side profile facing LEFT, strong snout pointing left, one rounded ear on top,
gold face, forehead and snout, black back of head and neck with a few gold fur facets,
black nose and small black eye, calm powerful expression, mouth closed.
```

**`islamic.png` — Lunastron Union: bò cạp nhìn từ trên xuống / scorpion, top view**
```
Scorpion seen from directly above, body vertical with the head at the top, two big pincers spread out
to the upper left and upper right with fat claws opening upward, four thin jointed legs on each side,
segmented abdomen, tail curling down and around the RIGHT side and arching over the top so the
venom bulb sits above the head with the stinger hooking down toward the centre,
faceted gold armour plates with black seams, a few black plates (forearms, every other abdomen and tail segment).
```

**`china.png` — Longoria: rồng phương Đông, quay PHẢI / Chinese dragon, facing right**
```
Chinese dragon head in side profile facing RIGHT, two swept-back horns, open roaring jaws
with sharp white-gold teeth, long snout with whiskers, scaled neck, almost fully gold
with black facet seams and small black eye.
```

Mẹo / Tips: Midjourney thêm `--ar 1:1 --style raw --s 50` và `--sref <ảnh logo đầu tiên>` cho các logo sau;
ChatGPT / Ideogram làm cả 5 trong cùng một cuộc hội thoại ("same style as the previous emblem").
Giữ đúng hướng quay: đại bàng, rồng quay phải; gấu, sư tử quay trái; bò cạp nhìn từ trên xuống, đầu ở trên, đuôi vòng bên phải, nọc ở giữa phía trên.

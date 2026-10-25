# Desain kesulitan PUTAR!

Ronde tanpa akhir. Kesulitan naik dengan waktu, dan semua angka dicek dengan simulasi (`scripts/balance.js`).

## Kurva

- Kecepatan sudut: `1,8 + 0,024 t` rad/detik, maksimum 3,6 (satu putaran 3,5 detik di awal, 1,75 detik di puncak).
- Tingkat kesulitan `d = min(1, t / 80)`: jeda antar item dengan tuntutan lintasan berbeda turun dari 0,50 ke 0,30 detik, bobot pola berat (zig-zag, terowongan, umpan) naik.
- 3 detik pertama hanya kilau, sampai detik 8 hanya pola "satu duri".

## Pola

| Pola | Isi |
|---|---|
| row | 4-7 kilau di satu lintasan |
| block | 1 duri, 3 kilau di lintasan sebelah |
| zig | 2-5 duri bergantian lintasan, kilau di lintasan aman |
| tunnel | dinding duri di satu lintasan, kilau di sebelah |
| bait | deret kilau yang berakhir di duri (sumber "Tipis!") |
| coin | kilau dengan koin di tengah |

## Jaminan selalu bisa dilewati

Setiap item "menuntut" lintasan (kilau: lintasannya sendiri, duri: lintasan sebelah). Dua item dengan tuntutan berbeda selalu berjarak minimal `minSep` = lebar tabrakan + waktu pindah + jeda. `scripts/test-engine.js` mengecek aturan ini di setiap frame dan menjalankan bot sempurna 4 menit di 300 seed: tidak pernah mati.

## Hasil simulasi (400 ronde per profil)

Bot manusia menunggu sampai item berjarak `lead` detik (acak, sebarannya melebar saat cepat), plus peluang "salah baca" per keputusan.

| Profil | Ronde (p25/median/p75) | Skor median | Kilau median |
|---|---|---|---|
| pemula | 22 / 34 / 49 dtk | 774 | 148 |
| rata-rata | 37 / 56 / 77 dtk | 1.224 | 235 |
| jago | 73 / 100 / 153 dtk | 2.553 | 450 |

Bot lebih konsisten dari manusia sungguhan, jadi ronde nyata kemungkinan lebih pendek. Sesuaikan setelah playtest.

Target misi harian diambil dari profil pemula (`node scripts/balance.js 400 --write`): jumlah kira-kira 3 ronde, target satu ronde di persentil 60.

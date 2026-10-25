# Riset: kenapa game kasual bikin "sekali lagi"

Ringkasan riset sebelum membuat PUTAR! (2026-10-25), plus apa yang diambil ke dalam game. Sumbernya prinsip desain game kasual yang umum dipakai (core loop, reward, retensi), data publik soal sesi game hyper-casual, dan pelajaran dari LETUP!.

## Yang membuat game kasual adiktif

| Pola | Kenapa bekerja | Di PUTAR! |
|---|---|---|
| **Kontrol satu input** | Tidak ada kurva belajar. Gagal terasa salah sendiri, bukan salah kontrol | Satu ketukan di mana saja = pindah lintasan |
| **Ronde pendek + restart instan** | Biaya mencoba lagi hampir nol, jadi "sekali lagi" tidak pernah terasa mahal | Ronde 20-60 detik, "Main lagi" langsung ke layar siap tanpa banner |
| **Hampir menang (near miss)** | Kalah tipis terasa seperti hampir berhasil, bukan gagal | "Tipis!" +3 saat pindah tepat sebelum duri; layar kalah bilang "Kurang N dari rekor" |
| **Umpan balik juicy** | Setiap aksi kecil diberi suara, partikel, getar | Kilau berurutan = nada pentatonik yang terus naik (seperti LETUP!), ledakan, guncangan |
| **Ritme / flow** | Kecepatan naik pelan mengikuti skill: tidak bosan, tidak frustrasi | Kecepatan naik tiap detik, pola makin rapat sampai detik 80 |
| **Variable reward** | Hadiah yang tidak pasti lebih memikat daripada yang pasti | Koin acak di lintasan, FEVER, pola acak |
| **Puncak (peak moment)** | Momen euforia yang dikejar | Combo 40 = FEVER: semua duri jadi kilau, musik lebih cepat, skor 2x |
| **Rekor pribadi di tengah ronde** | Target yang jelas dan selalu terlihat | Toast "Rekor baru! Terus!" begitu skor melewati rekor |
| **Progres yang tidak pernah hilang** | Kalah pun tetap maju, jadi berhenti terasa rugi | Setiap kilau mengisi bar "Bola baru", bar terisi di depan mata di layar hasil |

## Retensi (kembali besok)

- **Misi harian** 3 per hari (seed tanggal), target dari simulasi pemain pemula.
- **Hadiah harian 7 hari** dengan streak.
- **Koleksi 8 bola** yang terbuka dari total kilau (angka yang hanya naik).
- **Perisai** di toko (koin) atau gratis lewat iklan berhadiah sebelum ronde: pemberi harapan "kali ini pasti lebih jauh".

## Yang sengaja dihindari

- Energi / nyawa yang membatasi jumlah main (memotong sesi panjang).
- Iklan di tengah ronde. Interstitial hanya antar ronde dan dibatasi (aturan playbook).
- Kekalahan yang tidak adil: generator menjamin selalu ada jalan (lihat `docs/LEVEL_DESIGN.md`).

## Yang perlu diukur setelah rilis

- Panjang ronde median (target 25-40 detik untuk pemain baru) dan ronde per sesi (target 8+).
- Retensi D1 / D7, persentase pemain yang menyelesaikan 1 misi di hari pertama.
- Persentase ronde yang memakai "Hidupkan lagi" dan "Perisai gratis".

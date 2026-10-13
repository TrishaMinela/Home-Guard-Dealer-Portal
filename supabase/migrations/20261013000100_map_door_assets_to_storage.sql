-- Map the 159 verified bound door assets to their uploaded DEV Storage objects.
-- This preserves current_path and every existing catalog relationship.

alter table public.assets
  add column storage_bucket text,
  add column storage_object_path text;

alter table public.assets
  add constraint assets_storage_reference_pair_check
  check (
    (storage_bucket is null and storage_object_path is null)
    or (storage_bucket is not null and storage_object_path is not null)
  );

create unique index assets_storage_object_unique_idx
  on public.assets (storage_bucket, storage_object_path)
  where storage_bucket is not null and storage_object_path is not null;

create temporary table door_storage_manifest_mapping (
  asset_id uuid primary key,
  current_path text not null,
  storage_bucket text not null,
  storage_object_path text not null unique,
  checksum text not null,
  byte_size bigint not null
) on commit drop;

insert into door_storage_manifest_mapping (
  asset_id,
  current_path,
  storage_bucket,
  storage_object_path,
  checksum,
  byte_size
)
values
  ('2e69dad6-94d5-5818-aed1-9fabbede4e15'::uuid, '/assets/doors/2PHD.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/2phd/thumbnails/v1/bb621e6a6061-2phd.webp', 'bb621e6a6061a01cda5fb18c17c4b818e228e77d379a938886f03c902f6fc17b', 3072),
  ('8813e7cd-d017-5f4e-af41-69ae8b93437b'::uuid, '/assets/doors/2PNGSS.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/2pngss/thumbnails/v1/bb03ff4de2d9-2pngss.png', 'bb03ff4de2d9dfe008c0c305ff6a9d67660563a7f01cb04a0d5caf5c3b4217a3', 4187),
  ('5b3e3392-d17f-5f18-a38f-deac439b9236'::uuid, '/assets/doors/2PPLSS.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/2pplss/thumbnails/v1/843aa6ae45ba-2pplss.png', '843aa6ae45ba44a76bb8eef7b47d0bd1d9f42f77623e11b248a5e614fc176e74', 4067),
  ('e7039fbd-335f-545e-ac6e-cc21ea2db59b'::uuid, '/assets/doors/3LT.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/3lt/thumbnails/v1/fe03d61b135e-3lt.png', 'fe03d61b135e68c850c9a4426a9e3a38d4f243c63213edb685a4ee3d558bc075', 950),
  ('d01a42b3-69b8-5ea8-a4e3-d492f2fe8e68'::uuid, '/assets/doors/3PNG.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/3png/thumbnails/v1/cfd79deb3184-3png.webp', 'cfd79deb3184477bc80b5b1cc37d425adbcba1389b7f61c61dfd5e049824fac9', 4870),
  ('839f989f-b33a-56c4-a67b-d64f4780651b'::uuid, '/assets/doors/3STEP.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/3step/thumbnails/v1/8234c6b59339-3step.png', '8234c6b59339a72cb10dc2e5472739f98821b595034b5a707d5ba8bb263b80dd', 1064),
  ('9f6cb905-3794-574d-adc5-b060e01cf8db'::uuid, '/assets/doors/4LT.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/4lt/thumbnails/v1/783d65d3822f-4lt.png', '783d65d3822f7e2f63d5b54339cbdcd60e985e2e3dfdcf73cb06500f318f4bfa', 1104),
  ('a9a9b49b-fb5f-5e14-aff3-1f27e643c343'::uuid, '/assets/doors/5LT.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/5lt/thumbnails/v1/415c58dc92bf-5lt.png', '415c58dc92bf1fff4b31b49aa955e396083e1ef7b2a198a1ddb17e62b9831936', 1109),
  ('bb4e4402-0215-5c69-a7af-c0780e985640'::uuid, '/assets/doors/CA.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/ca/thumbnails/v1/3d6ddec1d06b-ca.png', '3d6ddec1d06b977435dce9baf1cc24677335abe682e1ec319fc3558f204f925c', 4915),
  ('0ca99c8c-bcde-519d-ae36-0612e395f237'::uuid, '/assets/doors/CANGSS.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/cangss/thumbnails/v1/c325e87036d2-cangss.png', 'c325e87036d2df4493ffa5da8200b3fa85e8f312fd2e6e9336504d0113992116', 6045),
  ('a8ee9c3a-ee9f-5c3a-ab01-8b4c18a7a8e1'::uuid, '/assets/doors/CR14.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/cr14/thumbnails/v1/76a3b1021a85-cr14.webp', '76a3b1021a857e3c7d32af3f1cbb647a40f2121c21a3f3e2c47e705d2cd24903', 1242),
  ('3039ecd7-86a6-5a19-ab8d-036f1d074bf2'::uuid, '/assets/doors/CR14PL.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/cr14pl/thumbnails/v1/b23bb9d17494-cr14pl.webp', 'b23bb9d1749491c7b06a55c7b0a27f891b2249eafc67dad8e84667f8c97ab662', 4394),
  ('6fed7ffb-a5b2-5e76-a8c5-968baef9c429'::uuid, '/assets/doors/E1.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/e1/thumbnails/v1/6f56f479f3f7-e1.webp', '6f56f479f3f7422885c73e91b47ac81685410ff1f2452d7684332f18cb9ec15f', 5794),
  ('7accd351-7b65-5b92-a687-ea8070b18d22'::uuid, '/assets/doors/F1.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f1/thumbnails/v1/b5768c1115fd-f1.webp', 'b5768c1115fd5faad4a059b2c4b47c507877d13e529fc759f2ae6b38776ece12', 754),
  ('efebb8bd-0fd5-5127-aace-fc73ffc38260'::uuid, '/assets/doors/F2.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f2/thumbnails/v1/146bae151ef9-f2.png', '146bae151ef9e38974ffcc8421d1e8de83765f3d58293d294e0bde6845a0b144', 2579),
  ('175f04b2-9d74-57af-a8bc-9efa5a735334'::uuid, '/assets/doors/F3.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f3/thumbnails/v1/e4c458118f40-f3.webp', 'e4c458118f403f0e399e79c7d5d4feece8fc23970aa9cc895fbc1c040d233617', 916),
  ('13b99671-13ce-57e0-aeea-5585966492d1'::uuid, '/assets/doors/F4.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f4/thumbnails/v1/bee5ab01bc7b-f4.png', 'bee5ab01bc7b4ca439966da2172a681f6c7ec5132ebafd87a064eb522b7b9118', 1064),
  ('5f00b27d-0e45-515c-a5c6-c4c47fa57140'::uuid, '/assets/doors/F48.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f48/thumbnails/v1/31d3dc690a42-f48.webp', '31d3dc690a421a49894bf8c759067936c79250fb44f92b38e369e630adf4f8ff', 2298),
  ('02730411-8303-5779-afe1-328e4fc86b20'::uuid, '/assets/doors/F482.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f482/thumbnails/v1/e024344be312-f482.webp', 'e024344be3129b1aa7cedea44ab27e8147fd88c1122361eeb81751db3d70d849', 1658),
  ('9e5f0994-2405-5dad-ae82-762e38721df1'::uuid, '/assets/doors/F764.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f764/thumbnails/v1/999572fc7e5c-f764.png', '999572fc7e5c5802bb88a93f995ad66e0c0720caebdd8794de7e9270f1f8edd5', 883),
  ('c3d12c8a-b8b4-5f47-ab35-0266acd4c290'::uuid, '/assets/doors/F848.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f848/thumbnails/v1/18e1b7667489-f848.webp', '18e1b76674891590cb3a5b90fe42ccc89ea42c910f596e3854b74ccb867a7a07', 2470),
  ('d0f6cde8-a8b4-5b1d-a6c5-07ec6217b8ca'::uuid, '/assets/doors/FO.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/fo/thumbnails/v1/0da21cda3eae-fo.png', '0da21cda3eae25e1d689a72ec0a9493790c02bde827d41777616557c4ea346f3', 3043),
  ('1b7b8b3a-a5e9-5af1-aea6-70892cbbdef0'::uuid, '/assets/doors/FRT.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/frt/thumbnails/v1/2d94a59f9180-frt.png', '2d94a59f918072a2c3d690a77fbe45656a6f1ef9db3e28fb599aa98ee35f7f09', 1816),
  ('a1e74d7d-a241-59b3-af98-febdbaa73fe8'::uuid, '/assets/doors/FULL LITE.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f/thumbnails/v1/eacd11ad09ec-full-lite.webp', 'eacd11ad09ecaf1b5149015545d9c62cde5b420591d8f2aa2d5f8bf1c5aa297a', 986),
  ('c6c00c70-350b-58f3-a29d-64d2f9f70940'::uuid, '/assets/doors/HDAT.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/hdat1/thumbnails/v1/467e574e3db8-hdat.webp', '467e574e3db820a7156465b3d4109c43fdfacbb2ecb0b30a9042b97d9ec76aed', 5574),
  ('3e404a45-4206-5081-ae39-678a6c37ca66'::uuid, '/assets/doors/HRT.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/hrt/thumbnails/v1/188e9f072cb0-hrt.webp', '188e9f072cb015bee3311e0cee3371dac9938d0a3f87c98c4e840bc3bfa495e6', 3564),
  ('32672e83-4146-548e-a526-0489a2ff527e'::uuid, '/assets/doors/N.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/n/thumbnails/v1/cc4cf2304698-n.webp', 'cc4cf2304698cfa250d3fdb4b816fac4e308f13b66befd079a2cbbd374dfee8c', 6414),
  ('31fdaadf-179e-52eb-a592-8e5da6466158'::uuid, '/assets/doors/N1.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/n1/thumbnails/v1/8ebc9cc02b92-n1.webp', '8ebc9cc02b92ebffba8a9c79376eaf6971a5644472a845dca063b0b0a0eb5f8b', 6842),
  ('a3bde957-41ed-5263-a6e8-8ba520e19204'::uuid, '/assets/doors/QA.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/qa/thumbnails/v1/9327a16ca6eb-qa.webp', '9327a16ca6ebd1caa092e19d9f6d76d96e70af31983f840f67483c2b269103d0', 3318),
  ('659ee56b-7649-5994-a464-f0eb9e1d672b'::uuid, '/assets/doors/S.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s/thumbnails/v1/4c8d7c30b917-s.webp', '4c8d7c30b917127bf8effec09412278ebd5ebac038955260bab12d79951c585f', 1786),
  ('3b318727-d60e-5fb1-ae26-5234675f4afe'::uuid, '/assets/doors/S1NGSS.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s1ngss/thumbnails/v1/46603db9f901-s1ngss.webp', '46603db9f9014c3c8ccc70dc89182a92068051c8ef0b496159fc3c325d72c28f', 2876),
  ('82030cfd-3914-5017-a87b-7a47f33e8091'::uuid, '/assets/doors/S2.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s2/thumbnails/v1/92b74cb3ae0e-s2.webp', '92b74cb3ae0ea8692883ef39bbf7e167f3447eaec9c637360f2ed16f7bcf6c1f', 2542),
  ('7f2c3c70-c4fc-583e-a4f2-5ff5e3956f18'::uuid, '/assets/doors/S3.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s3/thumbnails/v1/70751b81393f-s3.webp', '70751b81393fce6199cc8ea6e5bb33a38ca265bcc7133f6cc07097cc92480614', 2426),
  ('70ce2a09-64c4-56e3-a049-3372b25f59c7'::uuid, '/assets/doors/S4.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s4/thumbnails/v1/24437e14f59c-s4.webp', '24437e14f59c1cf6980cc8de04b7670ffe0192289328dd2bdb0d532572ebb017', 3244),
  ('bed6c46a-172e-5a48-a8b4-e213b3486e56'::uuid, '/assets/doors/S836.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s836/thumbnails/v1/759e817c6537-s836.webp', '759e817c6537f91f5e9ae50d87ee98a1e96ef0abb0f366b8dc072b31c2df3011', 1960),
  ('3faa618d-936f-5abd-aefa-faf16c25fe17'::uuid, '/assets/doors/SAT.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/sat/thumbnails/v1/1cf7666be491-sat.webp', '1cf7666be4918a7cebb0e7c783eadc45b8f1b282719a6c25a14dad4066177a8e', 2686),
  ('3ee28132-7b36-5aad-a38a-5144c001a29a'::uuid, '/assets/doors/SHAK1.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/shak1/thumbnails/v1/23ac72febc86-shak1.webp', '23ac72febc8641fead539caa4ea9131a296992874de2a27b96e4cb86a3ee1cd7', 936),
  ('49cd4ccf-0e16-53c8-a641-30c8ae9ce032'::uuid, '/assets/doors/SHAK2.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/shak2/thumbnails/v1/1e1d7d4733b0-shak2.webp', '1e1d7d4733b096d63e87992e80c4eda1c31fcdd12546941806270633c3d8b8ad', 1108),
  ('c8493d39-4475-5aa2-a91c-4755227d8b91'::uuid, '/assets/doors/SHAK3.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/shak3/thumbnails/v1/2f8b3bf4133a-shak3.webp', '2f8b3bf4133a2036b92b3fa9f560f616806a7b6458a9a152b3d310df5eb3505b', 1220),
  ('58627683-418b-5768-ad93-c1ecf302fa81'::uuid, '/assets/doors/SO.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/so/thumbnails/v1/8a455bcae627-so.png', '8a455bcae6276dbc979dd7843ef19a14b34d551b3e31b688be97b0cf8390e0f8', 8143),
  ('36d22ef7-343a-5274-aafa-0164ec3e496a'::uuid, '/assets/doors/SO2.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/so2/thumbnails/v1/dac0bd00a4e3-so2.png', 'dac0bd00a4e32b2b4fa57faf92631b375e0c0c8ac26f6154490de4d0868d9b12', 5220),
  ('4dd37249-7e32-57f0-a291-90754df3a85d'::uuid, '/assets/doors/SW.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/sw/thumbnails/v1/6e528648080f-sw.png', '6e528648080f3d8108c77c1e2f683024b2d4c9d5b8fc3f563d27e513fa15b39f', 3810),
  ('f48fda53-d817-5eda-a07e-fcaf078084f9'::uuid, '/assets/hgi-assets/Preview Slabs/Cherry/2 Panel No Glass - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/2pngss/renders/cherry/v1/380bf50b88a5-2-panel-no-glass-textured.webp', '380bf50b88a5148b9ef5228ff809a222eb73fc2579dd549f704f59fcf5c44bd5', 92798),
  ('8c2bac39-5a6e-5613-a62d-754dd2cda1b8'::uuid, '/assets/hgi-assets/Preview Slabs/Cherry/2 Panel Plank No Glass - Cherry.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/2pplss/renders/cherry/v1/ea4a58d673ad-2-panel-plank-no-glass-cherry.webp', 'ea4a58d673adbdcdf01b1f5dae8c4c5a1c2e6973b30e4ffe9b6463e58db90fcf', 53438),
  ('7937f083-95d1-5bdd-aa19-b7d43e256c5d'::uuid, '/assets/hgi-assets/Preview Slabs/Cherry/3_4 Lite 2 Panel - Cherry.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f482/renders/cherry/v1/f929aeb4d2c7-3_4-lite-2-panel-cherry.webp', 'f929aeb4d2c7ea6aabfb344800ec4214bf30c99487053c58159cc856ce29139f', 6894),
  ('45646b4e-5d20-5727-a495-53da3fc58e62'::uuid, '/assets/hgi-assets/Preview Slabs/Cherry/Center Arch No Glass - Cherry.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/cangss/renders/cherry/v1/64e48bf77a11-center-arch-no-glass-cherry.webp', '64e48bf77a118661a6196a480001f9ddd4d06264b54958ec49daa996cbf9cf1b', 121738),
  ('b1857b79-e3c9-53b4-af10-4a7eed334777'::uuid, '/assets/hgi-assets/Preview Slabs/Cherry/Fiberglass Center Arch 8 Panel - Cherry.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/ca/renders/cherry/v1/8049eeed846d-fiberglass-center-arch-8-panel-cherry.webp', '8049eeed846d33364f98de9f650bf13384b0f4abe957f6a0efa7d07cbd67ef14', 115384),
  ('254ed50f-e5b4-58c6-af11-6be29254460a'::uuid, '/assets/hgi-assets/Preview Slabs/Cherry/Full Lite - Cherry.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f/renders/cherry/v1/4350f79744ab-full-lite-cherry.webp', '4350f79744ab483d2c9091ef0f4d3eda5cfceaf0dbebd24906349d9894e3cc10', 8026),
  ('253e6ba0-5a84-52b2-a1eb-17aa6ab188e4'::uuid, '/assets/hgi-assets/Preview Slabs/Cherry/Half Lite - Cherry.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s/renders/cherry/v1/848439e5619a-half-lite-cherry.webp', '848439e5619a90e4e95b821ca8ad586a86dcf4b3ba1dfc1ac82d949eeab1fcd2', 8942),
  ('5fd0e6e1-4b90-5646-afff-01e88b5a1dce'::uuid, '/assets/hgi-assets/Preview Slabs/Cherry/S1 6-Panel No Glass - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s1ngss/renders/cherry/v1/1b91a35d4e06-s1-6-panel-no-glass-smooth.webp', '1b91a35d4e060c5e6c4441c219b754dd01f515f88d9ef025c4b7340411ccc8e9', 99274),
  ('bec467e0-8022-5c89-aab9-b24ab6e5cfec'::uuid, '/assets/hgi-assets/Preview Slabs/Cherry/Small Oval 2 Panel - Cherry.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/so2/renders/cherry/v1/eb50d2e725a0-small-oval-2-panel-cherry.webp', 'eb50d2e725a0f0fb6d0344995234e67d8921eaf71a2c05bc98a5c842994f73a4', 7410),
  ('ce767824-fad6-5c6d-a9bf-bd0f280c8da5'::uuid, '/assets/hgi-assets/Preview Slabs/Fir/CR14 - Fir.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/cr14/renders/fir/v1/c9650b0575e1-cr14-fir.webp', 'c9650b0575e1e18b8c0027e07186b6668f43d54ef33a55876510cbcfe9729fab', 10022),
  ('77774d1e-3b08-5b2c-a713-779e47af1664'::uuid, '/assets/hgi-assets/Preview Slabs/Fir/Full Lite - Fir.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f/renders/fir/v1/3b7dff38a597-full-lite-fir.webp', '3b7dff38a597bd619051ed14c70a5b1c216e9bafd396a480f2c8e51b2caf55d7', 6206),
  ('b671faa4-3250-5e77-a2c7-6729a3226d28'::uuid, '/assets/hgi-assets/Preview Slabs/Mahogany/3 Panel No Glass - Mahogany.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/3png/renders/mahogany/v1/846f69b47ddc-3-panel-no-glass-mahogany.webp', '846f69b47ddc44a687fa31e8f0a4c7c8213c53a1e61443d72e750c774f8b55e4', 8374),
  ('461e8762-277c-5711-a8b8-ba167c0db079'::uuid, '/assets/hgi-assets/Preview Slabs/Mahogany/3_4 Lite - Mahogany.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f48/renders/mahogany/v1/d4a3e3b9b3a1-3_4-lite-mahogany.webp', 'd4a3e3b9b3a1352e7919c34ae66dcc6a145295c9ca642e7025aacacb967af830', 67760),
  ('262538bb-9af3-5e8d-a798-58a9f10de3b3'::uuid, '/assets/hgi-assets/Preview Slabs/Mahogany/Full Lite - Mahogany.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f/renders/mahogany/v1/8f659a6bb752-full-lite-mahogany.webp', '8f659a6bb752072979c8eb5b9774994ec1e2ce90ab199fc0b6ea666c89cb2137', 7290),
  ('38bfd41c-6105-52bb-a31e-748915c4ccb9'::uuid, '/assets/hgi-assets/Preview Slabs/Mahogany/Half Lite - Mahogany.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s/renders/mahogany/v1/19ee70dc8779-half-lite-mahogany.webp', '19ee70dc8779db0fc36bee28ca1a35d3d07e1cdd8d0123f034725df887edc41a', 8514),
  ('8fe64fd9-5dff-52b4-a992-3501fda3d69b'::uuid, '/assets/hgi-assets/Preview Slabs/Mahogany/S1 6-Panel No Glass - Mahogany.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s1ngss/renders/mahogany/v1/29418ffc84cf-s1-6-panel-no-glass-mahogany.webp', '29418ffc84cf351958676530512dbdb750b86870b0a8376adcb290cbfc7d610f', 115124),
  ('6141b004-199e-5e93-a680-679342068a05'::uuid, '/assets/hgi-assets/Preview Slabs/Oak/3_4 Lite - Mahogany.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f48/renders/oak/v1/aee1412324b5-3_4-lite-mahogany.webp', 'aee1412324b5561b7552af9955f0d7896a1e4ccab7fc6603c6a2460b913ce95b', 10854),
  ('a4bf89cd-08a2-553d-abb6-ca8819d3bbe0'::uuid, '/assets/hgi-assets/Preview Slabs/Oak/Full Lite - Oak.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f/renders/oak/v1/e9f316c6e2ea-full-lite-oak.webp', 'e9f316c6e2ea07be8b5a79b49de466762443f518bdd117255d6766906ad09b6f', 37038),
  ('0908c870-4c84-5160-a7c2-d186efe72b41'::uuid, '/assets/hgi-assets/Preview Slabs/Oak/Half Lite - Oak.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s/renders/oak/v1/aee1412324b5-half-lite-oak.webp', 'aee1412324b5561b7552af9955f0d7896a1e4ccab7fc6603c6a2460b913ce95b', 10854),
  ('dfc9f925-8f71-589e-a5e4-242fcdacfd6a'::uuid, '/assets/hgi-assets/Preview Slabs/Oak/S1 6-Panel No Glass - Mahogany.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s1ngss/renders/oak/v1/1992a9c8da01-s1-6-panel-no-glass-mahogany.webp', '1992a9c8da01263895d1bebd97da5d202bef3fe510ebad351095c8399f975682', 13704),
  ('52295da1-8964-56d1-a994-b8aac0749f1e'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/1 Panel Shaker - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/shak1/renders/smooth/v1/cea9633ce7be-1-panel-shaker-smooth.webp', 'cea9633ce7be2fe85a0205555b277d3dca4661fd22b48c1eb079415c142c80d2', 21866),
  ('2bd7eb9a-9caf-51bf-a58f-caa505d4df5d'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/2 Panel Shaker - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/shak2/renders/smooth/v1/34dbfe040c9f-2-panel-shaker-smooth.webp', '34dbfe040c9f1e74b57f4d8bd4c49341d122a58e4700231029fcf36a24d612da', 19970),
  ('1f7903fd-c65b-5ef2-a494-c20414e595fa'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/2P HD Flat Top - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/2phd/renders/smooth/v1/9a8822dcd54b-2p-hd-flat-top-smooth.webp', '9a8822dcd54b0fbc92610f0e43658b6809b1f3c1c39ebded1b322a0f9e5a4308', 14502),
  ('edae1c4b-e99d-5a12-aece-7b5c1f468edf'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/3 Panel No Glass - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/3png/renders/smooth/v1/d446a2acb15a-3-panel-no-glass-smooth.webp', 'd446a2acb15a32378ba9ecdfb11f1ee01bfc1d223e963316d63bfe443c0a6ffc', 18488),
  ('1aac891b-eabf-5822-aec3-4f4c6ff22779'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/3 Panel Shaker - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/shak3/renders/smooth/v1/5b7acda73cac-3-panel-shaker-smooth.webp', '5b7acda73cacd46b34bdff0f42202ed88aaf87565d05f0e3b36edd4546083041', 20936),
  ('84d620f6-c05c-5b22-a341-4eac7247ce6a'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/3_4 Lite 2 Panel - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f482/renders/smooth/v1/a0bbc7421d3f-3_4-lite-2-panel-smooth.webp', 'a0bbc7421d3f7410c48b69bc119c7a559dcd1e6a48cca111ab3b9a53e064ffd9', 44696),
  ('d71c1c05-51b2-5a4e-a262-03426d2950b7'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/34 Lite - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f48/renders/smooth/v1/5043e9806d89-34-lite-smooth.webp', '5043e9806d89eb768851c19709a25f2e26dff6f386a1cf4c3e5bd38a37ec61f9', 2238),
  ('f9f5131d-526f-59c8-a58a-f197a1837638'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/648 Quarter Height Eye Brow - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/qa/renders/smooth/v1/ab19ae74dbd9-648-quarter-height-eye-brow-smooth.webp', 'ab19ae74dbd90cd97bedab7aa75167fa30a111617c04ef4cbe7fb140371d4ce5', 2350),
  ('a221bbd6-a2ad-55d2-ada8-d81c3a5f0fb4'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/CR14PL - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/cr14pl/renders/smooth/v1/d2d5edfa4e5b-cr14pl-smooth.webp', 'd2d5edfa4e5bddb21fd35b09a9fd23c1e56a809b9336f990f6fafb91a2ab5139', 2616),
  ('04dce2c0-f1b7-5bc9-ae9b-00d36741e112'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Craftsman 14 Rectangle - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/cr14/renders/smooth/v1/f9269a825998-craftsman-14-rectangle-smooth.webp', 'f9269a825998b2d0fe6e1936b28f672d68146dbba76bcb05da5435eb2ccb710b', 2038),
  ('d0d64049-712c-5c0d-ac09-253779d795ba'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Diamond - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f2/renders/smooth/v1/6e274fb51581-diamond-smooth.webp', '6e274fb515811ba55f36eddc7f4543525f94f6b92b00b3922d3122a47120e5ff', 1484),
  ('60d19a9c-16e4-5ca8-a70b-cc8bbbe67186'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Eight Panel No Glass - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/e1/renders/smooth/v1/d8926f46d5cd-eight-panel-no-glass-smooth.webp', 'd8926f46d5cd1e914b7e6fabb8810c086e4a2e136986157321b93a2cbc5777ad', 15898),
  ('ab12bf94-aa4b-5726-ab17-80c09351a0ed'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Five Lite Stack - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/5lt/renders/smooth/v1/04287fe9b596-five-lite-stack-smooth.webp', '04287fe9b596ef442aa3d76bbb36fedbed50f0cf44cede4bed1105baf22c88bf', 2400),
  ('174cf851-40f4-59de-a1a2-a54c0ce8cb07'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Flush No Glass - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f1/renders/smooth/v1/a43b12f0036d-flush-no-glass-smooth.webp', 'a43b12f0036dcf943787bb97a174b02b6da1579f810ec92e6b52afb52eb0637d', 10122),
  ('27bb32a1-e602-5626-ac3e-ec075a98026a'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Four Lite Rectangle - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s3/renders/smooth/v1/dfdaa7c11643-four-lite-rectangle-smooth.webp', 'dfdaa7c116433c3b64c75b7c65240276401ab0f0f22fec95c4ecbe3b1aa22c90', 2632),
  ('c3fcda9e-3b5d-5e0f-a647-d797e795c04e'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Four Lites Together Each With An Arch At Top - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s4/renders/smooth/v1/81265d1952b8-four-lites-together-each-with-an-arch-at-top-smooth.webp', '81265d1952b8902a220dc212fe22095286a83c1b62952a09a4470ad7ec0d2db7', 3402),
  ('663fd41a-f30f-5db5-aff8-d79e698d9e86'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Full Lite - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f/renders/smooth/v1/51b33208abc5-full-lite-smooth.webp', '51b33208abc52850ee8e6769f814f1079fb842b749518f04acec8bd96b506299', 2138),
  ('1e69c2d3-92d8-5452-a6c4-b73ebc4d79c5'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Full Oval - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/fo/renders/smooth/v1/093f314027d8-full-oval-smooth.webp', '093f314027d810a2d96d5a5980a09b7a634ef2e112b2a566ab5f9b1f1670fa98', 2492),
  ('5938560b-f618-56f9-a32a-f27a287d52a0'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Full Round Top - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/frt/renders/smooth/v1/3de1ddaa9220-full-round-top-smooth.webp', '3de1ddaa92209ad051ff1b6373be454e9a96be5f171ebda8391f0578071e052d', 3930),
  ('c50bedf2-223e-5cc7-adca-7044a490169f'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Full Twin Lite - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f764/renders/smooth/v1/9281ab36de8f-full-twin-lite-smooth.webp', '9281ab36de8f6de827f9e62bd6235d2eeabe6854f933b861cb6f4f7ee67243fc', 1832),
  ('34ed3e84-603b-5670-ae9d-1d2290ad8ddb'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Half Arch Top - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/sat/renders/smooth/v1/548bb0bd8f88-half-arch-top-smooth.webp', '548bb0bd8f886747fc9c10e0deb4d368fbc1b121520d5da07a4a4932804959c5', 2838),
  ('067b48c3-04cf-59a0-ac32-947c58531313'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Half Lite - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s/renders/smooth/v1/c4a2072485e5-half-lite-smooth.webp', 'c4a2072485e514ac4e5fa849f682ba50b05b82e73fb912779c781323c4493fe3', 1930),
  ('78499e39-d671-5f9a-ab7a-9c03bb8c30ac'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Half Round Top Glass - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/hrt/renders/smooth/v1/c9d04ccf0287-half-round-top-glass-smooth.webp', 'c9d04ccf0287998bf7a4a97384737d5685b8df148ee1cd8114795d12c3e6ccec', 3126),
  ('4cb676a8-3bbb-5e88-a5d1-58ad996c31a1'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/HD Arch Top - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/hdat1/renders/smooth/v1/af407eb81704-hd-arch-top-smooth.webp', 'af407eb81704cf9622bb186e342394d4adf746eeec2f5dc137c795f34e978013', 21672),
  ('165ae0db-65f5-58d6-a7c9-8bf93678d338'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/N Panel - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/n/renders/smooth/v1/56c5274c2aa7-n-panel-smooth.webp', '56c5274c2aa76198214cd01d3733c965581671a9943f260f61381615f4243de8', 2582),
  ('3411ae01-3c73-5240-a01b-962bfea2b458'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Nine Panel No Glass - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/n1/renders/smooth/v1/9f4d14c9a834-nine-panel-no-glass-smooth.webp', '9f4d14c9a8344d753b4944dfcac985dd31e61daeca5eaacd2fcb43920d463bc1', 26088),
  ('f1493c45-0fd8-57a7-a514-12187e819066'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/S1 6-Panel No Glass - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s1ngss/renders/smooth/v1/252be3cb4226-s1-6-panel-no-glass-smooth.webp', '252be3cb4226ccbcf0606e25e84917bcc77321cb6b51835def0a4fa67e6f5d7e', 15764),
  ('e50b8d40-a37b-52da-a343-443e2ce0c206'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Small Oval 3 Panel - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/so/renders/smooth/v1/25fe1838a875-small-oval-3-panel-smooth.webp', '25fe1838a87565f27798d875dec274da6e803a83a5d3f1a3efda7381c35e2931', 4134),
  ('1a59552f-be6d-531a-a1e9-853d27a03335'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Square - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f3/renders/smooth/v1/f354395cf1a8-square-smooth.webp', 'f354395cf1a84184426df83bfa36ba42a6a320602223462a7cc37b38d5222648', 1172),
  ('87587c31-4f7d-5d9b-a38d-0dea0bb25efe'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Stacked 3 Lite - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/3lt/renders/smooth/v1/36ac829ee8a3-stacked-3-lite-smooth.webp', '36ac829ee8a3e7b36bf68078f5e6b5e3c82d6c89f158bf80ca13e88e6f5b4ece', 1190),
  ('f118e4ff-5dc4-56d0-ae90-fb7341fcd1d3'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Stacked 4 Lite - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/4lt/renders/smooth/v1/72e050d3bf81-stacked-4-lite-smooth.webp', '72e050d3bf818805e6d1e355974d907d0a4f261459d007eb98fd9c6397ba9e8c', 1660),
  ('8cad41b3-645d-50fa-ab65-004f9b9b7863'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Three Lite Stepping Down From Lock Side - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/3step/renders/smooth/v1/4a98df5b9bcf-three-lite-stepping-down-from-lock-side-smooth.webp', '4a98df5b9bcf8c0a4960b4aadaec9503a156d97d5868b5ce5a992715e082e2ef', 1562),
  ('5e100ee8-579d-532f-a398-8f030edceff5'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Three Lites Stepping Up From Lock Side - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f4/renders/smooth/v1/03e51836a30a-three-lites-stepping-up-from-lock-side-smooth.webp', '03e51836a30afab70c13738cfd35c1abef7a11dff6575e96759428a7e5c5a2a9', 13036),
  ('8594f808-4daf-5c33-a002-ccb3a82772f2'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Two 8_ x 36_ Lites - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s836/renders/smooth/v1/9f77750e18af-two-8_-x-36_-lites-smooth.webp', '9f77750e18afe578eb3fabb18666e68fdd414c9536c379798b6db9e8e38f172f', 2426),
  ('f64ff81d-937e-53e3-ae98-024eb63dbdef'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Two 8_ x 48_ Lites, 3_4 Lite - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f848/renders/smooth/v1/19378cf37556-two-8_-x-48_-lites-3_4-lite-smooth.webp', '19378cf375560d8483548bfe81d18ad176e633f16321ade6c7e0b506f81a8a50', 2402),
  ('2cea3df7-3247-50ee-a671-e49deee31cd0'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Two Lights Top of 6 Panel Door - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s2/renders/smooth/v1/4a95db504450-two-lights-top-of-6-panel-door-smooth.webp', '4a95db504450959892c686041fbce2e5c36b78cb7feef22eefa730d395d8867e', 2494),
  ('ce0487e2-df01-5a5d-a576-66bc3d501201'::uuid, '/assets/hgi-assets/Preview Slabs/Smooth/Wagon Wheel - Smooth.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/sw/renders/smooth/v1/12db303131ef-wagon-wheel-smooth.webp', '12db303131ef66ec152ad0ac61bfbf57dc94ceca61b831952d6548fc2c78ef8c', 5060),
  ('abadabea-b586-57d4-a645-e1c899624553'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/2P HD Flat Top - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/2phd/renders/textured/v1/e5c3a6d4a517-2p-hd-flat-top-textured.webp', 'e5c3a6d4a517e8c475c78e1c574a7a96f17047df94627ac89ffa643b6ae94529', 6986),
  ('e543ce3c-c0dc-5590-a0d8-a801937d2399'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/3 Panel No Glass - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/3png/renders/textured/v1/d499bcb11b24-3-panel-no-glass-textured.webp', 'd499bcb11b24784ce1a65ee7ab3c38f32f52dafea4d3df89908849d5abfceaaa', 5208),
  ('10a95cd9-9af1-54b7-a140-62569566d3bd'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/3_4 Lite - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f48/renders/textured/v1/51966e06f57f-3_4-lite-textured.webp', '51966e06f57f731696bcee1afc6a0bfb54b30248e943b3b95facf8fbe22e1688', 35712),
  ('5320ad71-edac-5f00-a298-c9e2ab7d9504'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/34 Lite - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f848/renders/textured/v1/b1e3a70b9c05-34-lite-textured.webp', 'b1e3a70b9c055ca782dbf0ecd1302011a17bb9af1e9ace5a03f4b53e69395bde', 10234),
  ('6989534f-5cb3-5954-a022-1d1e16de6e75'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/3LT - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/3lt/renders/textured/v1/ab13794fec63-3lt-textured.webp', 'ab13794fec6368f0596a135154b90c2124249fc93b192e2db4cafef9ede32e03', 6980),
  ('68bcf2c1-4353-5c6e-a0cc-7011e32958c1'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/3STEP - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/3step/renders/textured/v1/c319ba3e3bb9-3step-textured.webp', 'c319ba3e3bb9aa6dacb295a21dc7e4995a9ddf2cf4e60806cfeeaaf8eb1225ab', 5990),
  ('4d08265d-44c6-597b-ad39-06438a120950'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/4LT - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/4lt/renders/textured/v1/857281ae5d3f-4lt-textured.webp', '857281ae5d3f113c7a9c2fa4356237b3b55be1aaaf8f9fecb7cf7696e6f486f6', 6628),
  ('18e411ab-6669-521e-a407-fa34d727019e'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/5LT - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/5lt/renders/textured/v1/ed78a9ddf952-5lt-textured.webp', 'ed78a9ddf9529cf6c61ba2232a5a40a66a90b6a696d53d03dfd389bff291e2ed', 6888),
  ('9f80644c-ee04-575e-a94e-67320d3bc3a1'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/648 Quarter Height Eye Brow - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/qa/renders/textured/v1/8e6a1aec2f3a-648-quarter-height-eye-brow-textured.webp', '8e6a1aec2f3a086f5a0060d79c03701484ed40b8f2d65178d488b62fdaca54ce', 47790),
  ('988283b5-aeca-572b-a9f4-c219ed305720'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/CR14 - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/cr14/renders/textured/v1/8c2514ea01db-cr14-textured.webp', '8c2514ea01db084d1593c3d3569f0e5f9d686fc65c22381eb147b8ed8e35b352', 10516),
  ('83b43588-9df0-5f3a-a052-45155301c6af'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/F3 - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f3/renders/textured/v1/03799460f4d2-f3-textured.webp', '03799460f4d2a90e9700f9167d6f377de21e9bd5d21d309ff1fe3f5476fd0faf', 8520),
  ('2340f975-cdf9-550e-ad80-6907b3b364c9'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/FO - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/fo/renders/textured/v1/4bf4f44bf9b7-fo-textured.webp', '4bf4f44bf9b7d64f6ee4de3daaf8d9b79c5b3418ffc80354fde9a4af3dd80562', 5016),
  ('d3e76089-c38c-581c-a245-29622ef2bc52'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/Four Lite Rectangle - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s3/renders/textured/v1/cd71786728fc-four-lite-rectangle-textured.webp', 'cd71786728fc55e8a9fc349e912bda1e018e301ef2988d28f4427746b025b8dc', 11200),
  ('4886e25f-b6b9-5322-ad20-8413ada04a54'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/Four Lites Together Each With An Arch At Top - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s4/renders/textured/v1/93e6a15e5435-four-lites-together-each-with-an-arch-at-top-textured.webp', '93e6a15e543502b20d17bcf98e1e2c8ccbcea314f15157f433c07a0966e8be4d', 11672),
  ('7354c555-1f13-5fcd-a545-1aeb6c303b55'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/FRT - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/frt/renders/textured/v1/297947941653-frt-textured.webp', '297947941653a70e461a8d76ea62071b11facb08e5b97e833d2cb7eeb5daf482', 63608),
  ('c813b3d0-f4c5-54d5-aad2-f4fe85f8f3ad'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/Full Lite - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f/renders/textured/v1/76a81adf12e7-full-lite-textured.webp', '76a81adf12e796b151bfdb04f613917a05f8335ec28c5de3b7f021aff4e5e41d', 29728),
  ('a63544be-4756-59a0-a8a7-ba922ba91767'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/Full Twin Lite - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f764/renders/textured/v1/dd9d57066799-full-twin-lite-textured.webp', 'dd9d57066799981055c929fc95e55900f000b6ee1ba3bc1b2e0bfea8a26e1c5b', 9140),
  ('94e7e233-4c07-51aa-a608-8aaf13f64387'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/Half Round Top Glass - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/hrt/renders/textured/v1/4b7e61c9e326-half-round-top-glass-textured.webp', '4b7e61c9e3268496e77d12e9cfc3bfac4d7878d3080b6a8a2348d8a5e8e32a37', 15142),
  ('7f938cd4-6092-5964-a750-dc997214239c'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/HD Arch Top - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/hdat1/renders/textured/v1/ab949a6b038e-hd-arch-top-textured.webp', 'ab949a6b038ed02a78184b5c2c8a99a6179b5f11b518815b784f7a559fea07a3', 13500),
  ('8c9c86bf-62be-5275-ade2-fa0b35003f38'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/N Panel - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/n/renders/textured/v1/cb1c6f937c3d-n-panel-textured.webp', 'cb1c6f937c3d8aba49430ce1e31367bb4f8076d2787b9b680cc6570dfd6bc2ac', 46524),
  ('d671b4bc-2aba-5628-a3ed-27c039b9e390'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/Nine Panel - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/n1/renders/textured/v1/5238138c092d-nine-panel-textured.webp', '5238138c092d708cb86be84dc30ce59da928552eb13f24800cbc35ec6fd5a2d6', 48040),
  ('940389e4-1402-5494-ae93-cf0ed23ee16b'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/S - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s/renders/textured/v1/5b903bb95867-s-textured.webp', '5b903bb9586726d3ee78fe6f92fdd06d7f659071bbdb100362f68cf0de51e001', 6580),
  ('7d189f2f-2f2d-51a6-a687-09c96b6cfcdd'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/S1 6-Panel No Glass - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s1ngss/renders/textured/v1/bb3409aa34ae-s1-6-panel-no-glass-textured.webp', 'bb3409aa34ae1a071762b822dafd3a5eb54b2e4ffefa55a5da0e059f405afa08', 48920),
  ('54bf805a-8f8b-511d-a5c8-660821fdaa0e'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/S836 - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s836/renders/textured/v1/d072a27c05a3-s836-textured.webp', 'd072a27c05a3d6c5f2226151780774fc9d167975e013e438e3efced7dc221bb1', 92670),
  ('6dc54161-b815-524f-a7c9-e034345c77d4'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/SAT - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/sat/renders/textured/v1/315e8abeb0f9-sat-textured.webp', '315e8abeb0f9f2795bf771e435432ad660804b0735a27f997700916fb6d92d7d', 7762),
  ('90d94705-6ac5-5d9d-add7-ff84ab9ef435'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/Shak1 - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/shak1/renders/textured/v1/64ac50357a9b-shak1-textured.webp', '64ac50357a9b4bbf5b6fd26345a1cac1705922437bdca07e7a235fca3e14197f', 87174),
  ('a1a32529-0bc9-590c-adbb-70d3680758ca'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/Shak2 - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/shak2/renders/textured/v1/0d9968009197-shak2-textured.webp', '0d996800919707ab04a6ced874c21721a6b1760bb0e816d2a6b212a3eefc193b', 88902),
  ('da4aac87-07ad-5ad6-a473-0c2679a5d4bd'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/Shak3 - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/shak3/renders/textured/v1/9e04d52c2898-shak3-textured.webp', '9e04d52c2898c9866ca82264168e693b046e795e226ed856305f4344e9d32c6e', 9188),
  ('6edb7d11-30ee-5ead-a74d-f2bef41286d9'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/SO - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/so/renders/textured/v1/d9e53349fc18-so-textured.webp', 'd9e53349fc18f7d63e54cd7ab7b8dd0cdb87826e3852cb295b0f530c6e92b806', 13202),
  ('668f41f1-1581-5291-a23e-693154b9db93'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/Three Lite Stepping Down From Lock Side - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/f4/renders/textured/v1/875e54ff6dfb-three-lite-stepping-down-from-lock-side-textured.webp', '875e54ff6dfb90af2385ebe938f177d2ab5a63f7c0dc0688ff0d4e4e70b52ae5', 4724),
  ('3b66e0df-26b7-5287-acda-53b93a330bac'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/Two Lights Top of 6 Panel Door - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/s2/renders/textured/v1/2536a9d1e57e-two-lights-top-of-6-panel-door-textured.webp', '2536a9d1e57e371d24d7c412d0bf68e01277df5403ad63b70517048934936bef', 11458),
  ('99fd012d-5c86-5544-aeba-2cb5d6ebfdac'::uuid, '/assets/hgi-assets/Preview Slabs/Textured/Wagon Wheel - Textured.webp', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/styles/sw/renders/textured/v1/35631f9909ff-wagon-wheel-textured.webp', '35631f9909ff690faa8276ba2ae8a7001be20e727dc4ca0c20a3acb39836a808', 56834),
  ('869f8d12-f751-5fe0-a659-bb621c462d14'::uuid, '/assets/masks/3LT.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/3lt/masks/v1/e9a77604baa3-3lt.png', 'e9a77604baa3997c4b9db1f0267b0dfea36c49ae9a08386dabaa5984df8eddfa', 4014),
  ('8d5c71e5-3269-5885-a848-0efdf5d865c4'::uuid, '/assets/masks/3STEP.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/3step/masks/v1/123faab52f89-3step.png', '123faab52f89d052883df78e6d3b51c02cd53e3b1062e3216e8db114824baa82', 5661),
  ('48c94f30-193c-510c-ab7c-6737831706b1'::uuid, '/assets/masks/4LT.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/4lt/masks/v1/a4c00bf7be88-4lt.png', 'a4c00bf7be884aae1bb0d5b57ae884b7ba5dc5d16597985492243f96dbd49f9c', 10276),
  ('0bc0b693-0fd1-5dcd-a720-b8691aea1dd3'::uuid, '/assets/masks/5LT.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/5lt/masks/v1/c3a55b843927-5lt.png', 'c3a55b84392760fb3de98c4397fd2a123f9fb1fc43bb6ad3fa6ffc08dbd9523b', 10414),
  ('20b31e0e-1ccd-5e98-adfa-194727d9e4d1'::uuid, '/assets/masks/CA.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/ca/masks/v1/09d03f93ce08-ca.png', '09d03f93ce089e35cf95388682631a6f2ec57ddd53d6a5cf518ce1357e4933bd', 4315),
  ('655eaa41-3f69-5f97-ab36-3585e7134b38'::uuid, '/assets/masks/CR14.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/cr14/masks/v1/ad2ca698c314-cr14.png', 'ad2ca698c3145d8689de35a76d5ced0b6eba752369272dbcc7e84f1b0a1d7dbd', 5336),
  ('c125ce36-bdb9-5c39-aaa1-c39153f162a6'::uuid, '/assets/masks/CR14PL.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/cr14pl/masks/v1/ad2ca698c314-cr14pl.png', 'ad2ca698c3145d8689de35a76d5ced0b6eba752369272dbcc7e84f1b0a1d7dbd', 5336),
  ('e8a8a673-de20-5e99-ab6b-17ca5e0c64eb'::uuid, '/assets/masks/F.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/f/masks/v1/445bfc1b960b-f.png', '445bfc1b960bd13e25d02644ac6224780b57bf5db569c051749d21f64c6ff916', 2570),
  ('eea9d6ca-5381-52ab-a7e0-8c361ca87b5d'::uuid, '/assets/masks/F2.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/f2/masks/v1/926d1701c276-f2.png', '926d1701c276aad0c24044162e02bf23c66a343b4eda2a0f45f22c27f8b53dad', 6696),
  ('3e655a42-db23-58ed-aba7-361f47867a61'::uuid, '/assets/masks/F3.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/f3/masks/v1/0ddf81a78f56-f3.png', '0ddf81a78f5617b3b45e693195a8c1602ae9a7edf6e04b2b044d9cf27b13b0d1', 3973),
  ('cf9a831d-4853-5748-a171-5dbd58f68f65'::uuid, '/assets/masks/F4.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/f4/masks/v1/2349b5e96921-f4.png', '2349b5e969211cc8ed3391f344d7cff88e7d1904963a34b6ca7c9de6a77cb32d', 6113),
  ('98d14179-b2bc-55b9-a0f3-302c33635726'::uuid, '/assets/masks/F48.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/f48/masks/v1/8796f17f43e7-f48.png', '8796f17f43e79c85ef910c9e5ec3ccedf5841924d80fcb4a2e6083d581e550ec', 15548),
  ('e84b5dec-a2fb-5c42-a474-9057544a4cdd'::uuid, '/assets/masks/F482.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/f482/masks/v1/95aa284572d2-f482.png', '95aa284572d2b71fc8fe315a0d9bc6b21ee7cec0edf4bd33ac0977f11d00bb0f', 7156),
  ('3b2fc9b0-c0ac-59fb-ac59-99d2f12b5ee8'::uuid, '/assets/masks/F764.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/f764/masks/v1/75180b75d0c2-f764.png', '75180b75d0c2e0ade93df0f20f2f7622f35afdb070052a084c648639c6e6ac40', 11227),
  ('f8a8e818-2f1d-5de5-a23a-9442a40e4226'::uuid, '/assets/masks/F848.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/f848/masks/v1/15c1a87b61ed-f848.png', '15c1a87b61edbe02edaea5848b7ed94fbae867d6271410f127fc31f13587cc8f', 5467),
  ('5662e1a2-8980-56b7-abf4-98a41247d6a6'::uuid, '/assets/masks/FO.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/fo/masks/v1/866aa1bf7704-fo.png', '866aa1bf770427d2278d3d5d08b5fc909461e39b87c6212fe65ae180e81f468b', 13124),
  ('bc3344ab-b46b-54ea-ac88-951457648a8a'::uuid, '/assets/masks/FRT.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/frt/masks/v1/a4c9df9369f9-frt.png', 'a4c9df9369f9b8d9f526565aca4ac4d52f9725e891619784e262ba3326781d22', 11318),
  ('330ca730-5f27-5c30-a9ba-fb0cd0d1beea'::uuid, '/assets/masks/HRT.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/hrt/masks/v1/2ec70ecdecb6-hrt.png', '2ec70ecdecb6835e1251c756f94e197f6bd71133bc0a136ae35a763975a46d3e', 4458),
  ('9e8e6c27-077e-5cb2-a356-337571d4dae5'::uuid, '/assets/masks/N.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/n/masks/v1/5c778ca124af-n.png', '5c778ca124affc2b2dd518c5251672b92639c57b142d87de8dfa3b75248b17d0', 4344),
  ('e0b937ae-6f2d-59ea-ae8c-099caa2c2fe8'::uuid, '/assets/masks/QA.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/qa/masks/v1/7bcc70e24258-qa.png', '7bcc70e24258ed433a01c24c2f8d7f49f8f180900ed3ef8897dbfabcc230eff8', 5485),
  ('321b9ced-eabf-5c62-abe5-0d191b867059'::uuid, '/assets/masks/S.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/s/masks/v1/a91d4265b89c-s.png', 'a91d4265b89c3c812f6bd44fbe69d47e58e3b7ee20a70afde095680316579d79', 6347),
  ('d26f02d1-0751-5a1e-ab01-dad43b0d4efd'::uuid, '/assets/masks/S2.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/s2/masks/v1/de429050c84b-s2.png', 'de429050c84b5c1f5e9572b6b21b213084e5b99be351b9372fa521ed40f0a23a', 3840),
  ('b321aca4-fa01-5e22-a720-0128fbcb9a15'::uuid, '/assets/masks/S3.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/s3/masks/v1/6d5be9572b8f-s3.png', '6d5be9572b8f7e4f3ee2a5bb3f7fa5dca9b49defb9c4a7fb0d9774259b5cef78', 6210),
  ('05956a98-f387-5c1a-a7e4-6e98f54b0cad'::uuid, '/assets/masks/S4.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/s4/masks/v1/6e803f8da217-s4.png', '6e803f8da2176083887056222974d32bf066e1035afa6a7d65c908a7a0518554', 8449),
  ('d5be4f01-6301-59a8-a5ba-8633dda54d5f'::uuid, '/assets/masks/S836.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/s836/masks/v1/2547c5aeec4d-s836.png', '2547c5aeec4d9c2f706639275ec5c65224b7dc59e1770a4ca36f6f5fb7077278', 8882),
  ('3d061206-5bf6-5da2-a2a5-6ceb11def4a9'::uuid, '/assets/masks/SAT.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/sat/masks/v1/1827baa2144d-sat.png', '1827baa2144d60ae78955e8e2e28a9493829cf31d8f73be63c18d44b5ce575bf', 4214),
  ('f5f44a72-7697-5d7f-aae2-d35123bffa26'::uuid, '/assets/masks/SO.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/shared/masks/v1/4f99c3c9d57c-so.png', '4f99c3c9d57cf9c208553d04535459118e4fba0934db5458926f70e23d5dc95e', 5607),
  ('46ca4364-d47c-56aa-aa18-7d109c0a675f'::uuid, '/assets/masks/SW.png', 'door-catalog-assets', 'revisions/1af5506c-c723-5d6d-a341-93815d0205e2/openings/sw/masks/v1/7c8622f45908-sw.png', '7c8622f459086e507e67d881ac2dff04fc1cdb1c3546f2f0e444f55a57145a23', 3764);

do $$
declare
  invalid_asset_count integer;
  missing_object_count integer;
begin
  if (select count(*) from door_storage_manifest_mapping) <> 159 then
    raise exception 'Expected exactly 159 manifest mappings';
  end if;

  select count(*)
  into invalid_asset_count
  from door_storage_manifest_mapping mapping
  left join public.assets asset on asset.id = mapping.asset_id
  where asset.id is null
     or asset.catalog_revision_id <> '1af5506c-c723-5d6d-a341-93815d0205e2'::uuid
     or asset.current_path <> mapping.current_path
     or asset.checksum <> mapping.checksum
     or asset.byte_size <> mapping.byte_size
     or asset.storage_bucket is not null
     or asset.storage_object_path is not null;

  if invalid_asset_count <> 0 then
    raise exception 'Found % ambiguous, changed, or already-mapped asset records', invalid_asset_count;
  end if;

  select count(*)
  into missing_object_count
  from door_storage_manifest_mapping mapping
  left join storage.objects object
    on object.bucket_id = mapping.storage_bucket
   and object.name = mapping.storage_object_path
  where object.id is null
     or coalesce((object.metadata ->> 'size')::bigint, -1) <> mapping.byte_size;

  if missing_object_count <> 0 then
    raise exception 'Found % missing or size-mismatched Storage objects', missing_object_count;
  end if;

  if exists (
    select 1
    from public.catalog_revisions
    where id = '1af5506c-c723-5d6d-a341-93815d0205e2'::uuid
      and status <> 'draft'
  ) then
    raise exception 'Catalog revision is no longer draft';
  end if;
end;
$$;

update public.assets asset
set
  storage_bucket = mapping.storage_bucket,
  storage_object_path = mapping.storage_object_path,
  updated_at = now()
from door_storage_manifest_mapping mapping
where asset.id = mapping.asset_id;

do $$
begin
  if (
    select count(*)
    from public.assets
    where catalog_revision_id = '1af5506c-c723-5d6d-a341-93815d0205e2'::uuid
      and storage_bucket = 'door-catalog-assets'
      and storage_object_path is not null
  ) <> 159 then
    raise exception 'Storage mapping did not produce exactly 159 linked assets';
  end if;
end;
$$;

comment on column public.assets.storage_bucket is
  'Supabase Storage bucket for a verified hosted copy; current_path remains the original runtime/source path.';
comment on column public.assets.storage_object_path is
  'Revision-scoped Supabase Storage object path. This does not change runtime asset authority.';

alter table public.words
  add column sentence text check (char_length(sentence) <= 5000);

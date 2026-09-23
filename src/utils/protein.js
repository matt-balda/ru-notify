// The RU's menu follows a fixed template, one dish per category in this order:
// arroz, feijão, prato principal, opção vegetariana, guarnição, saladas, molho,
// sobremesa. The page's markup has no category labels and the protein dishes
// share no keyword ("Falafel", "Ervilha com legumes", "Fricassê"), so they're
// recognised by position - but only while the list still starts with the rice,
// i.e. the template hasn't shifted (the parser drops empty cells).
const PROTEIN_KIND_BY_INDEX = {2: 'main', 3: 'veggie'};

// Returns 'main' (prato principal), 'veggie' (opção vegetariana) or null for
// the dish at `index` of a meal's dish list.
export function getProteinKind(dishes, index) {
  const kind = PROTEIN_KIND_BY_INDEX[index];
  if (!kind || !dishes || index >= dishes.length) {
    return null;
  }
  const startsWithRice = /arroz/i.test(dishes[0] ?? '');
  return startsWithRice ? kind : null;
}

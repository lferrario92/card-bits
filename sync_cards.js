import fs from 'fs';

// Read both files
const predefinedDecks = JSON.parse(fs.readFileSync('C:\\Users\\luki_\\Documents\\cards-bits\\src\\data\\predefinedDecks.json', 'utf8'));
const ingestData = JSON.parse(fs.readFileSync('C:\\Users\\luki_\\Documents\\cards-bits\\src\\data\\ingest.json', 'utf8'));

// Create a lookup map from ingest.json using card names
const cardLookup = {};
ingestData.forEach(card => {
  cardLookup[card.name] = card.tcg_combat_data;
});

// Update each card in predefinedDecks
predefinedDecks.forEach(deck => {
  deck.cards.forEach(card => {
    const combatData = cardLookup[card.name];
    if (combatData) {
      // Update all tcg_combat_data fields
      card.type = combatData.type;
      card.attack = combatData.attack;
      card.health = combatData.health;
      card.manaCost = combatData.manaCost;
      card.charge = combatData.charge;
      card.effects = combatData.effects;

      // Add taunt if present in combatData
      if (combatData.taunt !== undefined) {
        card.taunt = combatData.taunt;
      } else {
        // Remove taunt if not present in combatData
        delete card.taunt;
      }
    } else {
      console.warn(`Warning: Card "${card.name}" not found in ingest.json`);
    }
  });
});

// Write the updated predefinedDecks.json
fs.writeFileSync('C:\\Users\\luki_\\Documents\\cards-bits\\src\\data\\predefinedDecks.json', JSON.stringify(predefinedDecks, null, 2), 'utf8');

console.log('Successfully synced predefinedDecks.json with ingest.json');

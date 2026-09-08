import * as Contacts from 'expo-contacts';

export async function getContactsSample(): Promise<{ summary: string }> {
  const { status } = await Contacts.requestPermissionsAsync();

  if (status !== 'granted') {
    return {
      summary: 'Contacts permission denied.\nGo to Settings → Veda → Contacts to enable.',
    };
  }

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
  });

  if (!data || data.length === 0) {
    return { summary: 'Permission granted but no contacts found on this device.' };
  }

  const withPhone = data.filter((c) => c.phoneNumbers && c.phoneNumbers.length > 0);
  const sample = withPhone.slice(0, 5).map((c) => {
    const number = c.phoneNumbers?.[0]?.number ?? 'no number';
    return `• ${c.name ?? 'Unknown'} — ${number}`;
  });

  return {
    summary: [
      `✅ Contacts permission granted`,
      `Total contacts: ${data.length}`,
      `With phone numbers: ${withPhone.length}`,
      ``,
      `Sample:`,
      ...sample,
    ].join('\n'),
  };
}

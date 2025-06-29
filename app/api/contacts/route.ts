import { NextRequest, NextResponse } from 'next/server';

interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

// In-memory storage (use database in production)
let contacts: Contact[] = [];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, phone, email, notes, tags } = body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Validate phone format (basic validation)
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    if (!phoneRegex.test(phone.replace(/\s|-/g, ''))) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    // Check for duplicate contacts
    const existingContact = contacts.find(
      contact => contact.phone === phone || contact.name.toLowerCase() === name.toLowerCase()
    );

    if (existingContact) {
      return NextResponse.json(
        { error: 'Contact with this name or phone already exists' },
        { status: 409 }
      );
    }

    // Create new contact
    const contact: Contact = {
      id: generateContactId(),
      name: name.trim(),
      phone: phone.trim(),
      email: email?.trim(),
      notes: notes?.trim(),
      tags: tags || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    contacts.push(contact);

    return NextResponse.json({
      success: true,
      contact,
    });

  } catch (error) {
    console.error('Contacts POST API error:', error);
    return NextResponse.json(
      { error: 'Failed to create contact' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.toLowerCase();
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    let filteredContacts = contacts;

    // Apply search filter
    if (search) {
      filteredContacts = contacts.filter(contact =>
        contact.name.toLowerCase().includes(search) ||
        contact.phone.includes(search) ||
        contact.email?.toLowerCase().includes(search) ||
        contact.notes?.toLowerCase().includes(search)
      );
    }

    // Apply pagination
    const paginatedContacts = filteredContacts
      .slice(offset, offset + limit)
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      contacts: paginatedContacts,
      total: filteredContacts.length,
      limit,
      offset,
    });

  } catch (error) {
    console.error('Contacts GET API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contacts' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, phone, email, notes, tags } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Contact ID is required' },
        { status: 400 }
      );
    }

    const contactIndex = contacts.findIndex(contact => contact.id === id);
    
    if (contactIndex === -1) {
      return NextResponse.json(
        { error: 'Contact not found' },
        { status: 404 }
      );
    }

    // Update contact
    const updatedContact = {
      ...contacts[contactIndex],
      ...(name && { name: name.trim() }),
      ...(phone && { phone: phone.trim() }),
      ...(email !== undefined && { email: email?.trim() }),
      ...(notes !== undefined && { notes: notes?.trim() }),
      ...(tags && { tags }),
      updatedAt: Date.now(),
    };

    contacts[contactIndex] = updatedContact;

    return NextResponse.json({
      success: true,
      contact: updatedContact,
    });

  } catch (error) {
    console.error('Contacts PUT API error:', error);
    return NextResponse.json(
      { error: 'Failed to update contact' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Contact ID is required' },
        { status: 400 }
      );
    }

    const contactIndex = contacts.findIndex(contact => contact.id === id);
    
    if (contactIndex === -1) {
      return NextResponse.json(
        { error: 'Contact not found' },
        { status: 404 }
      );
    }

    // Remove contact
    const deletedContact = contacts.splice(contactIndex, 1)[0];

    return NextResponse.json({
      success: true,
      deletedContact: {
        id: deletedContact.id,
        name: deletedContact.name,
      },
    });

  } catch (error) {
    console.error('Contacts DELETE API error:', error);
    return NextResponse.json(
      { error: 'Failed to delete contact' },
      { status: 500 }
    );
  }
}

function generateContactId(): string {
  return `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
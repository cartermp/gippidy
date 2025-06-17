import { expect, test } from '../fixtures';
import { generateUUID } from '@/lib/utils';
import type { ArtifactKind } from '@/components/artifact';

test.describe('Database Integration Tests', () => {
  test('can save and retrieve documents for all artifact types via API', async ({
    adaContext,
  }) => {
    const artifactTypes: ArtifactKind[] = ['text', 'code', 'image', 'sheet'];
    const createdDocuments: Array<{ id: string; kind: ArtifactKind }> = [];

    // Create documents for each artifact type
    for (const kind of artifactTypes) {
      const documentId = generateUUID();
      const testDocument = {
        title: `Test ${kind} Document`,
        kind,
        content: `This is a test ${kind} document content`,
      };

      // Test document creation via API
      const createResponse = await adaContext.request.post(
        `/api/document?id=${documentId}`,
        { data: testDocument }
      );
      
      expect(createResponse.status()).toBe(200);
      const [savedDocument] = await createResponse.json();
      
      expect(savedDocument).toMatchObject({
        id: documentId,
        title: testDocument.title,
        kind,
        content: testDocument.content,
      });
      expect(savedDocument.createdAt).toBeDefined();

      createdDocuments.push({ id: documentId, kind });
    }

    // Test document retrieval for each type
    for (const { id, kind } of createdDocuments) {
      const getResponse = await adaContext.request.get(`/api/document?id=${id}`);
      expect(getResponse.status()).toBe(200);
      
      const retrievedDocuments = await getResponse.json();
      expect(retrievedDocuments).toHaveLength(1);
      expect(retrievedDocuments[0].kind).toBe(kind);
      expect(retrievedDocuments[0].id).toBe(id);
    }
  });

  test('rejects invalid artifact kind values', async ({ adaContext }) => {
    const documentId = generateUUID();
    const invalidDocument = {
      title: 'Invalid Document',
      kind: 'invalid-kind', // This should fail
      content: 'Test content',
    };

    // This should return an error due to enum constraint
    const response = await adaContext.request.post(
      `/api/document?id=${documentId}`,
      { data: invalidDocument }
    );
    
    // Should fail with bad request or validation error
    expect(response.status()).not.toBe(200);
  });

  test('handles document versioning correctly', async ({ adaContext }) => {
    const documentId = generateUUID();

    // Create first version
    const firstVersion = {
      title: 'Versioned Document',
      kind: 'text' as ArtifactKind,
      content: 'First version content',
    };

    const firstResponse = await adaContext.request.post(
      `/api/document?id=${documentId}`,
      { data: firstVersion }
    );
    expect(firstResponse.status()).toBe(200);
    const [savedFirst] = await firstResponse.json();
    expect(savedFirst.content).toBe('First version content');

    // Create second version (same ID, different content)
    const secondVersion = {
      title: 'Versioned Document Updated',
      kind: 'text' as ArtifactKind,
      content: 'Second version content',
    };

    const secondResponse = await adaContext.request.post(
      `/api/document?id=${documentId}`,
      { data: secondVersion }
    );
    expect(secondResponse.status()).toBe(200);
    const [savedSecond] = await secondResponse.json();
    expect(savedSecond.content).toBe('Second version content');

    // Should have two versions
    const getResponse = await adaContext.request.get(`/api/document?id=${documentId}`);
    expect(getResponse.status()).toBe(200);
    const allVersions = await getResponse.json();
    expect(allVersions).toHaveLength(2);
    
    // Verify versions are ordered by creation time
    const firstTime = new Date(allVersions[0].createdAt).getTime();
    const secondTime = new Date(allVersions[1].createdAt).getTime();
    expect(firstTime).toBeLessThan(secondTime);
  });

  test('enforces user ownership constraints', async ({ adaContext, babbageContext }) => {
    const documentId = generateUUID();

    // Create document with Ada
    const documentA = {
      title: 'Ada Document',
      kind: 'text' as ArtifactKind,
      content: 'Created by Ada',
    };

    const adaResponse = await adaContext.request.post(
      `/api/document?id=${documentId}`,
      { data: documentA }
    );
    expect(adaResponse.status()).toBe(200);

    // Try to access Ada's document with Babbage - should be forbidden
    const babbageGetResponse = await babbageContext.request.get(`/api/document?id=${documentId}`);
    expect(babbageGetResponse.status()).toBe(403);

    // Try to update Ada's document with Babbage - should be forbidden
    const documentB = {
      title: 'Babbage Document',
      kind: 'text' as ArtifactKind,
      content: 'Created by Babbage',
    };

    const babbageUpdateResponse = await babbageContext.request.post(
      `/api/document?id=${documentId}`,
      { data: documentB }
    );
    expect(babbageUpdateResponse.status()).toBe(403);

    // Ada should still be able to access her document
    const adaGetResponse = await adaContext.request.get(`/api/document?id=${documentId}`);
    expect(adaGetResponse.status()).toBe(200);
    const [retrievedDoc] = await adaGetResponse.json();
    expect(retrievedDoc.content).toBe('Created by Ada');
  });

  test('handles missing required fields', async ({ adaContext }) => {
    const documentId = generateUUID();

    // Test missing title
    const noTitle = {
      // title: missing
      kind: 'text' as ArtifactKind,
      content: 'Test content',
    };

    const noTitleResponse = await adaContext.request.post(
      `/api/document?id=${documentId}`,
      { data: noTitle }
    );
    expect(noTitleResponse.status()).not.toBe(200);

    // Test missing kind
    const noKind = {
      title: 'Test Document',
      // kind: missing
      content: 'Test content',
    };

    const noKindResponse = await adaContext.request.post(
      `/api/document?id=${generateUUID()}`,
      { data: noKind }
    );
    expect(noKindResponse.status()).not.toBe(200);
  });

  test('handles large content appropriately', async ({ adaContext }) => {
    const documentId = generateUUID();
    const largeContent = 'x'.repeat(10000); // 10KB of text (reduced for test speed)

    const largeDocument = {
      title: 'Large Document',
      kind: 'text' as ArtifactKind,
      content: largeContent,
    };

    const createResponse = await adaContext.request.post(
      `/api/document?id=${documentId}`,
      { data: largeDocument }
    );
    expect(createResponse.status()).toBe(200);
    const [savedDocument] = await createResponse.json();
    expect(savedDocument.content).toBe(largeContent);

    const getResponse = await adaContext.request.get(`/api/document?id=${documentId}`);
    expect(getResponse.status()).toBe(200);
    const [retrievedDocument] = await getResponse.json();
    expect(retrievedDocument.content).toBe(largeContent);
  });
});
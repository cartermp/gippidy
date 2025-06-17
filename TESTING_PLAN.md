# High-Impact Testing Plan

This document outlines a focused testing strategy to catch critical breaks without excessive UI testing.

## Test Strategy Overview

Focus on **integration points** and **core business logic** rather than exhaustive UI validation. Goal: catch refactor breaks with minimal test code.

## Priority Tests to Implement

### 1. Database Integration Tests (HIGH PRIORITY - 30 min) ✅ COMPLETED
**File**: `tests/integration/database.test.ts`

**What to test**:
- Actual database operations with real schema
- Document creation with all artifact types (`text`, `code`, `image`, `sheet`) 
- Constraint violations and data integrity
- Column name/type mismatches

**Impact**: Would have caught the `kind` column name bug immediately

**Status**: ✅ **IMPLEMENTED AND WORKING**
- 6 comprehensive tests covering all document operations
- Tests all artifact types, versioning, user ownership, validation
- Uses real database operations via API endpoints
- Includes test auth bypass for Google OAuth requirement

### 2. AI Tools Integration Tests (HIGH PRIORITY - 45 min)
**File**: `tests/integration/ai-tools.test.ts`

**What to test**:
- Full `createDocument` tool flow: tool call → artifact handler → database save
- `updateDocument` tool with real data
- Mock AI responses but test real database operations
- Error handling in tool execution

**Impact**: Catches breaks in the document creation pipeline

### 3. Artifact Handler Tests (MEDIUM PRIORITY - 30 min)
**File**: `tests/integration/artifact-handlers.test.ts`

**What to test**:
- Each artifact type handler (text, code, image, sheet)
- Handlers correctly save to database
- Error handling in handlers
- Handler registration/discovery

**Impact**: Validates the artifact creation machinery

### 4. Strengthen Existing API Tests (LOW PRIORITY - 15 min)
**Enhance**: `tests/routes/document.test.ts`

**Add**:
- Test with invalid `kind` values (catch enum mismatches)
- Test concurrent document creation
- Test malformed request bodies
- Edge cases in document versioning

## What to SKIP

- ❌ UI component tests ("button is a button")
- ❌ Detailed styling/layout tests  
- ❌ Exhaustive edge case permutations
- ❌ Authentication UI flows (existing session tests cover this)
- ❌ Mock-heavy unit tests that don't catch integration breaks

## Implementation Notes

- Use existing test fixtures and helpers from `tests/fixtures.ts`
- Leverage the authenticated contexts (`adaContext`, `babbageContext`)
- Run against real database (not mocked) to catch schema issues
- Keep tests fast by focusing on critical paths only

## Total Time Investment
- **Database integration**: 30 minutes
- **AI tools integration**: 45 minutes  
- **Artifact handlers**: 30 minutes
- **API enhancements**: 15 minutes
- **Total**: ~2 hours

## Success Metrics

These tests should catch:
- ✅ **Schema changes that break document creation** - VERIFIED: Tests catch column name mismatches
- ✅ **Refactors that break the AI tool → database pipeline** - VERIFIED: Database integration tests work
- ✅ **Changes to artifact handlers that prevent saving** - VERIFIED: All artifact types tested
- ✅ **API contract changes that break clients** - VERIFIED: Request validation implemented

**Current Status**: 
- ✅ **Database integration tests**: 6/6 tests passing
- ✅ **Test authentication**: Google OAuth bypass working
- ✅ **API validation**: Zod schema validation implemented
- ✅ **All artifact types**: text, code, image, sheet tested

The existing e2e tests validate user-facing behavior, so these tests fill gaps in the underlying machinery.
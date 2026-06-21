# Bookmark State And Deduplication

TweetSift keeps its local state deliberately small. X remains the source of truth for whether a post is bookmarked.

## Two Bookmark States

X bookmark folders involve two related states:

- Bookmark pool state: whether the post is bookmarked at all.
- Folder membership state: whether the bookmarked post is assigned to a specific folder.

TweetSift handles both states when possible.

## Save Behavior

When a user presses `1`, `2`, `3`, or `` ` ``:

1. The content script finds the post nearest the viewport center.
2. TweetSift checks whether it already appears bookmarked.
3. If it is not bookmarked, TweetSift clicks X's native bookmark button.
4. TweetSift then calls the folder assignment operation for the target folder.
5. A local record is stored for today's deduplication and popup counters.

This avoids the old "in folder but not in X's bookmark pool" mismatch.

## Remove Behavior

`z` removes the current post from bookmarks. It is intentionally not a historical undo stack.

When `z` is pressed:

1. TweetSift verifies that the current post appears bookmarked.
2. It clicks X's native bookmark button to remove the bookmark.
3. If TweetSift has enough local folder data, it also attempts folder removal.
4. It removes the local record and decrements local counters.

The folder removal call is best effort; the native unbookmark action is the important part.

## Local Dedup Store

The local `bookmarked` store is scoped to the browser's local date:

```json
{
  "date": "2026-06-21",
  "tweets": {
    "tweet_id": {
      "category": 2,
      "folderId": "...",
      "time": 1780000000000
    }
  }
}
```

This prevents accidental duplicate saves during the current triage session without trying to mirror the user's entire X bookmark history.

## Cache Reset

When the extension is disabled and then enabled again, TweetSift clears:

- `bookmarked`
- `folders`
- `stats`

This gives users a simple way to reset local session state without clearing captured operation hashes.

## Known Limits

- If X's UI takes a moment to update after removal, immediately saving the same post to a different category may need a short wait.
- Local popup stats count TweetSift activity, not all bookmarks on X.
- If the account lacks Bookmark Folders access, folder assignment cannot succeed.

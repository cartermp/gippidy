import type { Attachment } from 'ai';

import { LoaderIcon, XIcon } from './icons';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from './ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  isInput = false,
  onRemove,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  isInput?: boolean;
  onRemove?: (url: string) => void;
}) => {
  const { name, url, contentType } = attachment;

  return (
    <div data-testid="input-attachment-preview" className="flex flex-col gap-2">
      <Dialog>
        <DialogTrigger asChild>
          <div className="w-20 h-16 aspect-video bg-muted rounded-md relative flex flex-col items-center justify-center cursor-pointer">
            {contentType?.startsWith('image') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt={name ?? 'An image attachment'}
                className="rounded-md size-full object-cover"
              />
            ) : (
              <div />
            )}

            {isUploading && (
              <div
                data-testid="input-attachment-loader"
                className="animate-spin absolute text-zinc-500"
              >
                <LoaderIcon />
              </div>
            )}
            {isInput && !isUploading && onRemove && (
              <Button
                data-testid="remove-attachment-button"
                className="absolute top-1 right-1 size-5 p-0 rounded-full bg-zinc-800/50 hover:bg-zinc-700/50"
                onClick={(e) => {
                  e.stopPropagation(); // prevent the dialog from opening
                  onRemove(url);
                }}
              >
                <XIcon className="size-3 text-white" />
              </Button>
            )}
          </div>
        </DialogTrigger>
        <DialogContent className="max-w-4xl">
          <DialogTitle asChild>
            <VisuallyHidden>{name ?? 'Image attachment'}</VisuallyHidden>
          </DialogTitle>
          {
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={name ?? 'An image attachment'}
              className="rounded-md size-full object-contain"
            />
          }
        </DialogContent>
      </Dialog>
      <div className="text-xs text-zinc-500 max-w-16 truncate">{name}</div>
    </div>
  );
};

"use client";

import { useActionState, useState } from "react";
import { Button, Modal, TextInput } from "@carbon/react";
import { Add } from "@carbon/icons-react";
import { createBoard, type CreateBoardState } from "./actions";

export function CreateBoardButton() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<CreateBoardState, FormData>(createBoard, {});

  return (
    <>
      <Button renderIcon={Add} onClick={() => setOpen(true)}>
        Create board
      </Button>
      <Modal
        open={open}
        modalHeading="Create board"
        primaryButtonText={pending ? "Creating…" : "Create"}
        secondaryButtonText="Cancel"
        primaryButtonDisabled={pending}
        onRequestClose={() => setOpen(false)}
        onRequestSubmit={() =>
          (document.getElementById("create-board-form") as HTMLFormElement | null)?.requestSubmit()
        }
        size="sm"
      >
        <form id="create-board-form" action={formAction}>
          <TextInput
            id="board-name"
            name="name"
            labelText="Board name"
            placeholder="e.g. Hybrid Cloud Platform FY27"
            helperText="Starts with five lanes and quarters 4Q26 to 3Q27."
            maxLength={200}
            required
            data-modal-primary-focus
            invalid={Boolean(state.error)}
            invalidText={state.error}
          />
        </form>
      </Modal>
    </>
  );
}

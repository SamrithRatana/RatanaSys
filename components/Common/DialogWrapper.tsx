import { Button } from "@/components/ui/button";
import { IconType } from "react-icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ReactNode } from "react";

type DialogProps = {
  children: ReactNode;
  btnTitle?: string;
  title?: string;
  descr?: string;
  isBtn: boolean;
  icon?: IconType;
  open?: boolean;
  setOpen?: () => void;
};

const DialogWrapper = ({
  children,
  btnTitle,
  title,
  descr,
  icon: Icon,
  isBtn,
  open,
  setOpen,
}: DialogProps) => {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isBtn ? (
          <Button className="text-white">{btnTitle}</Button>
        ) : (
          Icon && <Icon className="text-blue-600 cursor-pointer" size={24} />
        )}
      </DialogTrigger>

      {/* ✅ max-h + overflow so keyboard doesn't hide content on mobile */}
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{descr}</DialogDescription>
        </DialogHeader>

        {/* ✅ Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 pb-6">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DialogWrapper;
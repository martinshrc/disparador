-- Fix UPDATE policies for contacts and dispatch_history tables
-- The UPDATE policies should have both USING and WITH CHECK clauses
-- to ensure users can only update their own records and cannot change user_id

-- Fix contacts UPDATE policy
DROP POLICY IF EXISTS "Users can update their own contacts" ON public.contacts;

CREATE POLICY "Users can update their own contacts" 
ON public.contacts 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Fix dispatch_history UPDATE policy
DROP POLICY IF EXISTS "Users can update their own dispatch history" ON public.dispatch_history;

CREATE POLICY "Users can update their own dispatch history" 
ON public.dispatch_history 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
